# Conventions

## Coding Standards

### TypeScript

- **Target:** ES2021 with NodeNext modules
- **Strict mode:** Enabled with exceptions for strictFunctionTypes and strictPropertyInitialization
- **Imports:** ES module syntax (`import { ... } from "..."`)
- **Types:** PascalCase for interfaces/types, camelCase for variables
- **Async:** All I/O operations use async/await pattern

### Schema Validation

- **Library:** Zod for all data validation
- **Pattern:** Define schemas at top of files, use .describe() for AI context
- **Example:** TaskSchema with detailed field descriptions

### Error Handling

- **Approach:** LLM maxRetries for transient failures
- **Validation:** Zod schemas prevent invalid inputs
- **Logging:** console.log for tool operations

## File Organization

### Structure

- **Modules:** Flat structure within directories (agent/, tools/)
- **Extensions:** .ts for TypeScript, .js for config
- **Output:** Tools write to ../output relative to tools directory

### Naming

- **Files:** lowercase with underscores (filesystem.ts, graph.ts)
- **Directories:** lowercase (agent, tools, output)
- **Constants:** UPPER_SNAKE_CASE (OUTPUT_DIR)
- **Functions:** camelCase

## Language Usage

- **Primary:** English for code and comments
- **Mixed:** Some Portuguese comments present ("diretório onde os arquivos serão criados")
- **AI Context:** Detailed .describe() strings for LLM understanding

## Tool Integration

### LangChain

- **Tools:** tool() wrapper with name, description, schema
- **Messages:** BaseMessage types for conversation flow
- **State:** Annotation.Root with reducers for state management

### LangGraph

- **Graphs:** StateGraph with START/END nodes
- **Routing:** Conditional edges based on state
- **Config:** RunnableConfig for execution context

## Testing

### Jest

- **Config:** ESM support with ts-jest preset
- **Timeouts:** 20s for unit, 30s for integration
- **Setup:** dotenv/config for environment
- **Matchers:** Standard Jest assertions

### Test Structure

- **Unit:** tests/*.test.ts for isolated functions
- **Integration:** tests/*.int.test.ts for full graph execution
- **Naming:** describe/it blocks with clear descriptions
