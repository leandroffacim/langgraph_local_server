// graph.ts
import {
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage
} from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { END, START, StateGraph } from "@langchain/langgraph";
import { ChatOllama } from "@langchain/ollama";
import { createAgent } from "langchain";
import { z } from "zod";
import { listFilesTool, readFileTool, writeFileTool } from "../tools/filesystem.js";
import { StateAnnotation, Task } from "./state.js";
import { PerformanceMonitor } from "./performance-monitor.js";

const devTools = [writeFileTool, readFileTool, listFilesTool];
const supervisorLlm = new ChatOllama({ model: "qwen2.5-coder", temperature: 0, maxRetries: 2 });
const devLlm = new ChatOllama({ model: "deepseek-coder-v2", temperature: 0, maxRetries: 2 });

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TaskSchema = z.object({
    id: z.string().describe("Unique identifier for the task, e.g. 'task_1'"),
    title: z.string().describe("Short title of the task"),
    description: z.string().describe("Detailed description of what must be implemented"),
    dependsOn: z.array(z.string()).describe("IDs of tasks that must be completed before this one"),
});

const SupervisorOutputSchema = z.object({
    tasks: z.array(TaskSchema).describe("Ordered list of tasks respecting dependency order"),
});

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SUPERVISOR_PROMPT = `You are an autonomous software delivery supervisor. Your single job is to decompose a structured requirements brief into an ordered, executable task list for a devAgent. You do not write code. You do not answer questions. You only plan.

## Context
- devAgent is a senior TypeScript developer that uses write_file, read_file, and list_files.
- devAgent has NO memory between tasks — every task must be 100% self-contained.
- devAgent CANNOT ask for clarification. Every ambiguity must be resolved by you.
- devAgent CANNOT install packages. Assume dependencies are already installed.

## Output contract
You MUST return a JSON object matching this exact schema:
{
  "tasks": [
    {
      "id": "task_1",
      "title": "string — max 8 words, action-verb first",
      "description": "string — structured brief (see format below)",
      "dependsOn": ["task_id", ...]
    }
  ]
}

## Task description format
Each description MUST include all of these sections:

### FILES
- List every file to create or modify with its full relative path
- Use EXACTLY the paths from the fileStructure in the brief — do not invent new paths

### INTERFACES & SIGNATURES
- Every exported type, interface, and function signature with parameter types and return type
- Example: export function createUser(data: CreateUserDTO): Promise<User>

### IMPLEMENTATION NOTES
- Design patterns to follow (e.g. repository pattern, factory, singleton)
- Error handling strategy (throw, return Result<T, E>, etc.)
- Edge cases to handle explicitly

### DONE CRITERIA
- Exact observable conditions that confirm the task is complete
- Example: "src/services/userService.ts exists, exports createUser, getUser, deleteUser with correct signatures"

## File structure rules — CRITICAL
- Use ONLY the files listed in the brief's fileStructure — never add or remove files
- Never create both routes/X.ts AND routers/X.ts — the brief defines which convention to use
- Never create a file whose sole content is re-exporting another file
- A task is NOT done if any file contains placeholder comments (// TODO, // implement) or empty function bodies

## Dependency rules
- Tasks are executed sequentially, one at a time
- If task B imports from task A, then B.dependsOn must include task_A
- Sort tasks topologically: dependencies always appear before the tasks that need them
- Never create circular dependencies

## Scope rules
- Maximum 8 tasks per plan
- Never create tasks for: testing, linting, git operations, CI/CD, or documentation unless in the brief

## Anti-patterns — NEVER do these
- Vague descriptions like "implement the user logic" → always specify exact files and signatures
- Tasks with implicit dependencies → every import path must be explicit
- Mega-tasks combining setup + business logic + routing → split them
- Tasks that reference future tasks → each task must be executable with only prior tasks as context`;

const DEV_SYSTEM_PROMPT = `You are a senior TypeScript developer operating as an autonomous agent. You communicate exclusively through tool calls — never output code blocks, markdown, or explanations in plain text.

## Execution loop — follow this exactly, every time

1. **Parse the task** — read FILES, INTERFACES & SIGNATURES, IMPLEMENTATION NOTES, and DONE CRITERIA before calling any tool. If DONE CRITERIA is missing, infer it from the signatures.

2. **Write each file** — call write_file once per file with the complete, final content. Rules:
   - Never use placeholder comments like // TODO or // implement this
   - Never use type any — use unknown and narrow with type guards if needed
   - Every exported symbol must have an explicit return type annotation
   - Handle every Promise — no floating promises, no unhandled rejections
   - Follow the design pattern specified in IMPLEMENTATION NOTES exactly

3. **Verify each file** — immediately after write_file, call read_file on the same path. Compare the output against what you intended to write. If there is a mismatch, rewrite the file.

4. **Confirm structure** — after all files are written and verified, call list_files on the output directory. Verify every expected file is present.

## Code quality invariants
- Use strict TypeScript: no implicit any, no non-null assertions (!) except at JSON boundaries
- Errors must propagate explicitly: throw typed errors or return Result<T, E> — never swallow exceptions with empty catch blocks
- Imports use exact relative paths — no barrel imports unless the task explicitly describes an index.ts
- File-level exports only — no default exports unless the task specifies one

## Tool failure protocol
- If write_file fails: retry exactly once with identical content, then stop and report the error clearly
- If read_file shows wrong content after a successful write: rewrite the file once, then stop if it fails again
- Never silently continue after a tool failure

## What you do NOT do
- You do not install packages
- You do not create files not listed in the task's FILES section
- You do not refactor code from previous tasks unless explicitly instructed
- You do not ask questions or request clarification — if something is ambiguous, use the most conventional TypeScript pattern and proceed`;

const devReactAgent = createAgent({
    model: devLlm,
    tools: devTools,
    systemPrompt: DEV_SYSTEM_PROMPT,
});

// ─── Nodes ───────────────────────────────────────────────────────────────────

const supervisor = async (state: typeof StateAnnotation.State, _config: RunnableConfig): Promise<typeof StateAnnotation.Update> => {
    const systemMessage = new SystemMessage(SUPERVISOR_PROMPT);
    const structured = supervisorLlm.withStructuredOutput(SupervisorOutputSchema);

    try {
        const result = await structured.invoke([systemMessage, ...state.messages]);
        console.log("[supervisor] Output structured:", JSON.stringify(result, null, 2));
        if (!result?.tasks?.length) {
            throw new Error("Supervisor retornou lista de tasks vazia");
        }

        const tasks: Task[] = result.tasks.map((t) => ({ ...t, status: "pending" as const }));

        console.log(`[supervisor] ${tasks.length} tasks criadas:`, tasks);
        tasks.forEach((t, i) =>
            console.log(`  ${i + 1}. [${t.id}] ${t.title} (dependsOn: ${t.dependsOn.join(", ") || "none"})`)
        );

        return {
            tasks,
            currentTaskIndex: 0,
            next: "devAgent",
            messages: [
                {
                    role: "assistant",
                    content: `**Tasks planned (${tasks.length}):**\n${tasks
                        .map((t, i) => `${i + 1}. **${t.title}**\n   ${t.description}`)
                        .join("\n\n")}`,
                },
            ],
        };
    } catch (error) {
        console.error("[supervisor] Error:", error);
        throw error;
    }
};

const devAgent = async (state: typeof StateAnnotation.State, config: RunnableConfig): Promise<Partial<typeof StateAnnotation.State>> => {
    const { tasks, currentTaskIndex, performanceMonitor } = state;
    const currentTask = tasks[currentTaskIndex];

    if (!currentTask) {
        console.log("[devAgent] Nenhuma task encontrada no índice", currentTaskIndex);
        return {};
    }

    console.log(`\n[devAgent] Executando task ${currentTaskIndex + 1}/${tasks.length}: ${currentTask.title}`);

    // Start performance monitoring
    performanceMonitor.startTask(currentTask.id);

    try {
        const humanMessages = state.messages.filter((m: BaseMessage) => HumanMessage.isInstance(m));

        const agentMessages = [
            ...humanMessages,
            new HumanMessage(
                `Execute the following task. You MUST implement it by calling write_file for every file.\n\n` +
                `## Task ${currentTaskIndex + 1} of ${tasks.length}: ${currentTask.title}\n\n` +
                `${currentTask.description}\n\n` +
                `## Already completed tasks\n` +
                (currentTaskIndex === 0
                    ? "None — this is the first task."
                    : tasks
                        .slice(0, currentTaskIndex)
                        .map((t) => `- ✅ ${t.title}`)
                        .join("\n"))
            ),
        ];

        const result = await devReactAgent.invoke({ messages: agentMessages }, config);

        const filesWritten = result.messages
            .filter((m: BaseMessage) => ToolMessage.isInstance(m))
            .map((m: BaseMessage) => {
                const match = m.content.toString().match(/File created successfully: (.+)/);
                return match?.[1] ?? null;
            })
            .filter(Boolean) as string[];

        // Count tool calls (ToolMessage instances)
        const toolCalls = result.messages.filter((m: BaseMessage) => ToolMessage.isInstance(m)).length;

        console.log(`[devAgent] Task "${currentTask.title}" concluída. Arquivos: ${filesWritten.join(", ")}`);

        // End performance monitoring with success
        performanceMonitor.endTask(currentTask.id, true, toolCalls);

        // Marca task atual como done e avança o índice
        const updatedTasks = tasks.map((t, i) =>
            i === currentTaskIndex ? { ...t, status: "done" as const } : t
        );

        return {
            messages: result.messages,
            filesWritten,
            tasks: updatedTasks,
            currentTaskIndex: currentTaskIndex + 1,
            performanceMonitor,
            next: "reviewAgent", // futuro: rota para QA ou Reviewer dependendo da task
        };
    } catch (error) {
        console.error(`[devAgent] Erro na task "${currentTask.title}":`, error);

        // End performance monitoring with failure
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        performanceMonitor.endTask(currentTask.id, false, 0, [errorMessage]);

        throw error;
    }
};

// ─── Routing ─────────────────────────────────────────────────────────────────

const route = (state: typeof StateAnnotation.State): "devAgent" | "__end__" => {
    const { tasks, currentTaskIndex } = state;

    if (currentTaskIndex >= tasks.length) {
        const done = tasks.filter((t) => t.status === "done").length;
        console.log(`\n[router] Todas as tasks concluídas (${done}/${tasks.length}). Encerrando.`);
        return "__end__";
    }

    const next = tasks[currentTaskIndex];
    console.log(`[router] Próxima task: [${next.id}] ${next.title}`);
    return "devAgent";
};

// ─── Graph ───────────────────────────────────────────────────────────────────

const builder = new StateGraph(StateAnnotation)
    .addNode("supervisor", supervisor)
    .addNode("devAgent", devAgent)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", route, {
        devAgent: "devAgent",
        __end__: END,
    })
    .addConditionalEdges("devAgent", route, {   // loop: devAgent → próxima task ou END
        devAgent: "devAgent",
        __end__: END,
    });

export const graph = builder.compile();
graph.name = "Dev Agent";
