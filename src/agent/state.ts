// state.ts
import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

export interface Task {
    id: string;
    title: string;
    description: string;
    dependsOn: string[]; // ids das tasks que precisam ser concluídas antes
    status: "pending" | "in_progress" | "done";
}

export const StateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[], BaseMessageLike[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),

    // Fila de tarefas criada pelo supervisor (já ordenada por dependência)
    tasks: Annotation<Task[]>({
        reducer: (_state, update) => update, // supervisor substitui a lista inteira
        default: () => [],
    }),

    // Índice da tarefa sendo executada no momento
    currentTaskIndex: Annotation<number>({
        reducer: (_state, update) => update,
        default: () => 0,
    }),

    next: Annotation<string>,

    filesWritten: Annotation<string[], string[]>({
        reducer: (state, update) => [...(state ?? []), ...(update ?? [])],
        default: () => [],
    }),
});
