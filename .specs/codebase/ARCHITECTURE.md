# Architecture

**Pattern:** Agent-based multi-actor workflow (supervisor + dev agent)

## High-Level Structure

```
User Input
    ↓
Supervisor Agent (qwen2.5-coder)
    ↓
Task Decomposition
    ↓
Dev Agent (deepseek-coder-v2)
    ↓
Tool Execution (filesystem)
    ↓
File Outputs
```

## Identified Patterns

### Agent Workflow Pattern

**Location:** src/agent/graph.ts
**Purpose:** Orchestrates multi-agent conversation and task execution
**Implementation:** StateGraph with conditional routing based on task status
**Example:** StateAnnotation manages messages, tasks array, and current task index

### Tool-Based Execution Pattern

**Location:** src/tools/filesystem.ts
**Purpose:** Provides safe file system operations for agents
**Implementation:** LangChain tools with Zod schemas for validation
**Example:** writeFileTool creates files in output directory with mkdir recursive

### State Management Pattern

**Location:** src/agent/state.ts
**Purpose:** Maintains workflow state across agent interactions
**Implementation:** LangGraph Annotation with reducers for state updates
**Example:** tasks array with status tracking (pending/in_progress/done/failed)

## Data Flow

### Task Execution Flow

1. User provides requirements
2. Supervisor decomposes into ordered tasks
3. Dev agent processes tasks sequentially
4. Each task uses tools to read/write files
5. Files written to src/output/ directory
6. Process continues until all tasks complete

### Message Flow

- Human messages trigger supervisor
- Supervisor outputs task list
- Dev agent receives task details via state
- Tool results feed back into conversation

## Code Organization

**Approach:** Feature-based with clear separation of concerns

**Structure:**
- src/agent/: Core workflow logic (graph.ts, state.ts)
- src/tools/: Tool implementations (filesystem.ts)
- src/output/: Generated files (created by tools)
- tests/: Unit and integration tests
- scripts/: Build and validation scripts

**Module boundaries:**
- agent module: Handles graph definition and state
- tools module: Provides external capabilities
- tests module: Validation and verification
