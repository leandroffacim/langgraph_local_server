import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { createAgent } from "langchain";
import { z } from "zod";
import {
    listFilesTool,
    readFileTool,
    writeFileTool,
} from "../tools/filesystem.js";
import { StateAnnotation } from "./state.js";

const devTools = [writeFileTool, readFileTool, listFilesTool];

// ✅ LLMs fora das funções — instanciados uma única vez
const supervisorLlm = new ChatOllama({
    model: "llama3.1",
    temperature: 0,
    maxRetries: 2,
});
const devLlm = new ChatOllama({
    model: "llama3.1",
    temperature: 0,
    maxRetries: 2,
});

// ─── Schemas ────────────────────────────────────────────────────────────────

// Structured output: supervisor decide quem chama a seguir
const RouterSchema = z.object({
    next: z
        .enum(["devAgent", "__end__"])
        .describe("Próximo agente a ser chamado ou decisão de encerrar"),
    plan: z.string().describe("Plano detalhado para o agente executar"),
});

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SUPERVISOR_PROMPT = `You are a software development supervisor.
Your job is to:
1. Understand the user's requirement
2. Create a clear, detailed plan for the developer agent
3. Decide which agent should act next

Always respond with a structured plan before routing.`;

const DEV_AGENT_PROMPT = `You are an expert software developer.
Your responsibilities:
- Implement exactly what the plan describes
- Write clean, well-typed TypeScript/JavaScript code
- Follow SOLID principles and design patterns
- Explain your implementation decisions briefly`;

const DEV_SYSTEM_PROMPT = `You are a software developer. You ONLY communicate by calling tools.

RULES — follow them strictly:
- NEVER write code in plain text or markdown
- ALWAYS call write_file for EVERY file you need to create
- After writing, call read_file to verify the content is correct
- If multiple files are needed, call write_file multiple times
- Do NOT stop until all files from the plan are created

Your ONLY job is to call write_file until the plan is fully implemented.`;

const devReactAgent = createAgent({
    model: devLlm,
    tools: devTools,
    systemPrompt: DEV_SYSTEM_PROMPT,
});

// ─── Nodes ───────────────────────────────────────────────────────────────────

const supervisor = async (
    state: typeof StateAnnotation.State,
    _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
    const systemMessage = new SystemMessage(SUPERVISOR_PROMPT);
    const structured = supervisorLlm.withStructuredOutput(RouterSchema);

    try {
        const result = await structured.invoke([
            systemMessage,
            ...state.messages,
        ]);

        // Garante que o resultado é válido antes de continuar
        if (!result?.next || !result?.plan) {
            console.error("[supervisor] structured output inválido:", result);
            throw new Error("Supervisor retornou schema inválido");
        }

        console.log("[supervisor] routing to:", result.next);
        console.log("[supervisor] plan:", result.plan);

        return {
            next: result.next,
            messages: [
                { role: "assistant", content: `**Plan:** ${result.plan}` },
            ],
        };
    } catch (error) {
        console.error("[supervisor] Error:", error);
        // Fallback: sempre roteia pro devAgent se o structured output falhar
        return {
            next: "devAgent",
            messages: [
                {
                    role: "assistant",
                    content: "**Plan:** Implement what the user requested.",
                },
            ],
        };
    }
};

const devAgent = async (
    state: typeof StateAnnotation.State,
    config: RunnableConfig,
): Promise<Partial<typeof StateAnnotation.State>> => {
    try {
        // Extrai o plano que o supervisor injetou como última mensagem assistant
        const supervisorPlan =
            state.messages
                .filter((m: BaseMessage) => AIMessage.isInstance(m))
                .at(-1)
                ?.content?.toString() ?? "";

        // Monta um histórico limpo + instrução clara como HumanMessage
        const agentMessages = [
            ...state.messages.filter((m: BaseMessage) =>
                HumanMessage.isInstance(m),
            ),
            new HumanMessage(
                `You MUST implement the following plan by calling write_file for every file.\n\n${supervisorPlan}`,
            ),
        ];

        const result = await devReactAgent.invoke(
            { messages: agentMessages },
            config,
        );

        const filesWritten = result.messages
            .filter((m: BaseMessage) => ToolMessage.isInstance(m))
            .map((m: BaseMessage) => {
                const match = m.content
                    .toString()
                    .match(/File created successfully: (.+)/);
                return match?.[1] ?? null;
            })
            .filter(Boolean) as string[];

        console.log("[devAgent] files written:", filesWritten);

        return {
            messages: result.messages,
            filesWritten,
        };
    } catch (error) {
        console.error("[devAgent] Error:", error);
        throw error;
    }
};

// ─── Routing ─────────────────────────────────────────────────────────────────

// ✅ Lê state.next — definido pelo supervisor via structured output
const route = (state: typeof StateAnnotation.State): "devAgent" | "__end__" => {
    return state.next === "devAgent" ? "devAgent" : "__end__";
};

// ─── Graph ───────────────────────────────────────────────────────────────────

const builder = new StateGraph(StateAnnotation)
    .addNode("supervisor", supervisor)
    .addNode("devAgent", devAgent)
    .addEdge(START, "supervisor") // sempre começa no supervisor
    .addConditionalEdges("supervisor", route, {
        // supervisor decide o próximo
        devAgent: "devAgent",
        __end__: END,
    })
    .addEdge("devAgent", END); // devAgent sempre termina

export const graph = builder.compile();
graph.name = "Dev Agent";
