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

const devTools = [writeFileTool, readFileTool, listFilesTool];

const supervisorLlm = new ChatOllama({ model: "llama3.1", temperature: 0, maxRetries: 2 });
const devLlm = new ChatOllama({ model: "llama3.1", temperature: 0, maxRetries: 2 });

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

const SUPERVISOR_PROMPT = `You are the supervisor of a software development team. You coordinate specialized agents to fulfill the user's request.

## Available Agents
- **devAgent**: Implements code — creates files, writes functions, sets up project structure
- **qaAgent**: (coming soon) Writes and runs tests, validates behavior, checks edge cases
- **reviewerAgent**: (coming soon) Reviews code quality, SOLID principles, security, performance

## Your Responsibilities
Analyze the user's request and break it down into an ordered list of tasks.
Each task must be self-contained and executable by the devAgent independently.

## Task Constraints
- Each task should take at most 1–3 files
- Avoid combining unrelated responsibilities
- Prefer smaller, composable tasks over large ones

## How to Write Tasks
Each task MUST include:

### id
A unique identifier like task_1, task_2, etc.

### title
A short, action-oriented label. Example: "Create database connection module"

### description
A detailed implementation brief containing:
  - 📁 Files to create or modify (full relative paths)
  - ⚙️ Functions and interfaces with signatures and types
  - 🔗 Dependencies on external packages or internal modules
  - 🧠 Implementation notes: patterns, edge cases, conventions
  - ✅ Done criteria: how to know this task is complete

### dependsOn
List the IDs of tasks that MUST be completed before this one starts.
If a task has no dependencies, use an empty array.

## Dependency Rules
- If task B uses code created by task A, then B.dependsOn = ["task_A"]
- The final task list must be sorted topologically: dependencies always come before the tasks that need them
- Never include circular dependencies

## Example
User: "Create an Express API with a user service and a database layer"

Supervisor's task list:

1. **Task ID**: task_1
   **Title**: Set up project structure and dependencies
   **Description**:
     - Create package.json with Express, TypeScript, and necessary typings
     - Create tsconfig.json with strict settings
     - Create src/ directory for source code
   **DependsOn**: []

2. **Task ID**: task_2
   **Title**: Implement database connection module
   **Description**:
     - Create src/db.ts
     - Export a function connectDB(): Promise<DBConnection>
     - Use a mock implementation that simulates async connection
   **DependsOn**: ["task_1"]

3. **Task ID**: task_3
   **Title**: Implement user service
   **Description**:
     - Create src/services/userService.ts
     - Export functions createUser(data), getUser(id), etc.
     - Use the DBConnection from db.ts to simulate database operations
   **DependsOn**: ["task_1", "task_2"]

4. **Task ID**: task_4
   **Title**: Set up Express server and routes
   **Description**:
     - Create src/server.ts
     - Set up an Express server that listens on port 3000
     - Create routes for user operations (e.g. POST /users, GET /users/:id)
     - Use the userService functions to handle requests
   **DependsOn**: ["task_1", "task_3"]

## Important
- Be specific. Vague tasks produce vague code.
- Always prefer explicit file paths over abstract descriptions.
- If the request is ambiguous, make a reasonable assumption and state it in the task description.
- Never route to agents marked as "coming soon".`;

const DEV_SYSTEM_PROMPT = `You are a senior software developer. You ONLY communicate by calling tools — never write code in plain text or markdown.

## Execution Workflow
Follow these steps IN ORDER for every task:

1. **Read the task** — The task description contains file structure, function signatures, and dependencies. Parse it carefully before touching any tool.
2. **write_file** — Create every file listed in the task. Write complete, working code — never placeholders or TODOs.
3. **read_file** — After writing each file, read it back to verify the content is exactly what was intended.
4. **list_files** — At the end, list the output directory to confirm all expected files are present.

## Code Quality Rules
- Always use TypeScript with explicit types — no implicit \`any\`
- Export every function, class, and interface that other modules may use
- Handle errors explicitly — never let promises fail silently
- Follow the patterns and conventions stated in the task (e.g. Adapter Pattern, Railway-oriented)
- If the task specifies dependencies, assume they are already installed

## File Writing Rules
- Write each file in a single write_file call with the complete final content
- Never write partial files expecting to append later
- Use the exact file paths specified in the task — do not invent paths

## Error Handling
- If write_file fails, retry once with the same content before giving up
- If a file path is ambiguous in the task, use the most conventional TypeScript project structure

## Done Criteria
You are done when:
- Every file listed in the task exists and has been verified with read_file
- list_files confirms the output directory matches the expected structure`;

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
    const { tasks, currentTaskIndex } = state;
    const currentTask = tasks[currentTaskIndex];

    if (!currentTask) {
        console.log("[devAgent] Nenhuma task encontrada no índice", currentTaskIndex);
        return {};
    }

    console.log(`\n[devAgent] Executando task ${currentTaskIndex + 1}/${tasks.length}: ${currentTask.title}`);

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

        console.log(`[devAgent] Task "${currentTask.title}" concluída. Arquivos: ${filesWritten.join(", ")}`);

        // Marca task atual como done e avança o índice
        const updatedTasks = tasks.map((t, i) =>
            i === currentTaskIndex ? { ...t, status: "done" as const } : t
        );

        return {
            messages: result.messages,
            filesWritten,
            tasks: updatedTasks,
            currentTaskIndex: currentTaskIndex + 1,
            next: "reviewAgent", // futuro: rota para QA ou Reviewer dependendo da task
        };
    } catch (error) {
        console.error(`[devAgent] Erro na task "${currentTask.title}":`, error);
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
