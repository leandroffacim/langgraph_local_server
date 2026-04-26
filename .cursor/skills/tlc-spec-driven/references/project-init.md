# Project Initialization

**Trigger:** "Initialize project", "Setup project", "Start new project"

## Process

Extract project vision via iterative Q&A (max 3-5 questions per message):

**Essential questions:**

1. O que você está construindo?
2. Para quem é e qual problema resolve?
3. Qual stack tecnológico você está usando? (se souber)
4. O que está no escopo da v1? O que está explicitamente excluído?
5. Restrições críticas? (prazo, técnico, recursos)

**Stop when:** Clear understanding of vision, goals, and boundaries.

## Output: .specs/project/PROJECT.md

**Structure:**

```markdown
# [Project Name]

**Vision:** [1-2 sentence description]
**For:** [target users]
**Solves:** [core problem being addressed]

## Goals

- [Primary goal with measurable success metric]
- [Secondary goal with measurable success metric]

## Tech Stack

**Core:**

- Framework: [name + version]
- Language: [name + version]
- Database: [name]

**Key dependencies:** [3-5 critical libraries/frameworks]

## Scope

**v1 includes:**

- [Core capability 1]
- [Core capability 2]
- [Core capability 3]

**Explicitly out of scope:**

- [What is NOT being built]
- [What is NOT being built]

## Constraints

- Timeline: [if applicable]
- Technical: [if applicable]
- Resources: [if applicable]
```

**Size limit:** 2,000 tokens (~1,200 words)

**Validation:**

- Vision clear in 1-2 sentences?
- Goals have measurable outcomes?
- Scope boundaries explicit?
