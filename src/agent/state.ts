import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

export const StateAnnotation = Annotation.Root({
    messages: Annotation<BaseMessage[], BaseMessageLike[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),
    next: Annotation<string>,
    filesWritten: Annotation<string[], string[]>({
        reducer: (state, update) => {
            const existing = state || [];
            const newFiles = update || [];
            return [...existing, ...newFiles];
        },
        default: () => [],
    }),
    // additionalField: Annotation<string>,
});
