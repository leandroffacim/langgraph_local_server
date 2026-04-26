# Structure

## Directory Layout

```
/
├── .specs/                    # Project documentation (created during development)
│   ├── project/              # Vision, roadmap, state
│   ├── codebase/             # Architecture analysis
│   └── features/             # Feature specifications
├── scripts/                  # Build and validation utilities
│   └── checkLanggraphPaths.js # Validates langgraph.json references
├── src/                      # Source code
│   ├── agent/                # Core workflow implementation
│   │   ├── graph.ts          # LangGraph definition and agents
│   │   └── state.ts          # State management and types
│   ├── tools/                # Tool implementations
│   │   └── filesystem.ts     # File system operations
│   └── output/               # Generated files (created by tools)
├── tests/                    # Test suites
│   ├── agent.test.ts         # Unit tests for agent logic
│   └── graph.int.test.ts     # Integration tests for full graph
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Testing configuration
├── langgraph.json            # LangGraph deployment config
├── README.md                 # Project documentation
└── LICENSE                   # MIT license
```

## File Purposes

### Configuration Files

- **package.json:** Defines project metadata, dependencies (LangChain, LangGraph, Ollama), and npm scripts (build, test, lint)
- **tsconfig.json:** TypeScript compiler options (ES2021 target, strict mode, NodeNext modules)
- **jest.config.js:** Jest configuration for TypeScript ESM testing with 20s timeout
- **langgraph.json:** LangGraph CLI configuration (graphs, env, dependencies)

### Source Files

- **src/agent/graph.ts:** Main workflow orchestration with supervisor and dev agents
- **src/agent/state.ts:** State schema with messages, tasks, and reducers
- **src/tools/filesystem.ts:** LangChain tools for file operations (read, write, list)

### Test Files

- **tests/agent.test.ts:** Unit tests for routing logic
- **tests/graph.int.test.ts:** Integration tests for end-to-end graph execution

### Scripts

- **scripts/checkLanggraphPaths.js:** Validation script ensuring langgraph.json paths exist

## Key Patterns

### Module Organization

- **agent/:** Contains all workflow-related code (graph definition, state management)
- **tools/:** Isolated tool implementations that can be imported by agents
- **output/:** Designated output directory for generated files

### File Naming

- **Consistent:** All source files use .ts extension
- **Descriptive:** filesystem.ts clearly indicates file system tools
- **Flat:** No deep nesting within modules

### Import Structure

- **Relative:** Tools import from "../tools/filesystem.js" (ESM requires .js extension)
- **External:** LangChain and LangGraph imports from @langchain/ packages
- **Local:** State and tools imported within agent module
