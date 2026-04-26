# Integrations

## External Services

### Ollama (LLM Provider)

**Purpose:** Local AI model hosting and inference
**Integration:** ChatOllama class from @langchain/ollama
**Models Used:**
- qwen2.5-coder: Supervisor agent for task decomposition
- deepseek-coder-v2: Dev agent for code implementation
**Configuration:** temperature: 0, maxRetries: 2
**Deployment:** Local installation required

### LangSmith (Observability)

**Purpose:** AI application monitoring and tracing
**Integration:** Environment variable LANGSMITH_API_KEY
**Usage:** Optional, enabled via .env file
**Documentation:** Mentioned in README setup instructions

## Development Tools

### LangGraph CLI

**Purpose:** Project scaffolding, deployment, and management
**Integration:** @langchain/langgraph-cli package
**Configuration:** langgraph.json defines graphs and dependencies
**Commands:** Used for building and deploying LangGraph applications

### GitHub Actions

**Purpose:** Continuous integration and testing
**Integration:** .github/workflows/ (referenced in README)
**Workflows:**
- unit-tests.yml: Runs Jest unit tests
- integration-tests.yml: Runs integration tests
**Triggers:** Push and pull request events

## Internal Systems

### File System Operations

**Purpose:** Code generation and file management
**Integration:** Node.js fs/promises API
**Tools:** Custom LangChain tools (writeFileTool, readFileTool, listFilesTool)
**Output:** Files written to src/output/ directory
**Safety:** Recursive directory creation, UTF-8 encoding

## Data Flow

### AI Pipeline

1. **Input:** User requirements via HumanMessage
2. **Supervisor:** Ollama qwen2.5-coder decomposes into tasks
3. **Dev Agent:** Ollama deepseek-coder-v2 executes tasks using tools
4. **Tools:** File system operations for code generation
5. **Output:** Generated files and conversation history

### Observability (Optional)

- **LangSmith:** Traces LLM calls and agent interactions
- **Logging:** Console output from tools and agents

## Dependencies

### Runtime Dependencies

- **@langchain/core:** Base messaging and runnable interfaces
- **@langchain/langgraph:** Workflow orchestration
- **@langchain/ollama:** Ollama LLM integration
- **langchain:** Agent creation utilities
- **zod:** Schema validation
- **ollama:** Direct Ollama API access (if needed)

### Development Dependencies

- **@langchain/langgraph-cli:** CLI tools
- **Jest ecosystem:** Testing framework
- **ESLint/Prettier:** Code quality tools
- **TypeScript:** Compilation and type checking

## Environment Requirements

- **Node.js:** v20 (specified in langgraph.json)
- **Yarn:** v1.22.22 (package manager)
- **Ollama:** Local installation with required models
- **LangSmith:** Optional API key for observability
