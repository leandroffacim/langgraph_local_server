# Testing

## Framework

**Primary:** Jest v29.7.0 with ts-jest preset
**Configuration:** ESM support, 20-second timeout for unit tests, 30-second for integration
**Setup:** dotenv/config loaded automatically

## Test Types

### Unit Tests

**Location:** tests/*.test.ts
**Purpose:** Test isolated functions and logic
**Example:** tests/agent.test.ts tests the route function
**Command:** `yarn test`

### Integration Tests

**Location:** tests/*.int.test.ts
**Purpose:** Test full graph execution end-to-end
**Example:** tests/graph.int.test.ts invokes graph with input and validates output
**Command:** `yarn test:int`

### Combined

**Command:** `yarn test:all` (runs unit + integration + linting)

## Test Patterns

### Structure

- **describe/it:** Standard Jest BDD structure
- **async/await:** All tests support async operations
- **Timeouts:** Configured per test type (20s unit, 30s integration)

### Assertions

- **Matchers:** Standard Jest (toEqual, toBeDefined, toBeGreaterThan)
- **Content checks:** String content validation (toContain)
- **Type checks:** typeof and Array.isArray assertions

### Example Patterns

```typescript
describe("Graph", () => {
    it("should process input through the graph", async () => {
        const input = "What is the capital of France?";
        const result = await graph.invoke({ messages: [input] });

        expect(result).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
        expect(lastMessage.content.toString().toLowerCase()).toContain("hi");
    }, 30000);
});
```

## CI/CD Integration

**Platform:** GitHub Actions
**Workflows:**
- unit-tests.yml: Runs on push/PR
- integration-tests.yml: Runs on push/PR
**Triggers:** Automated on repository events

## Coverage

**Status:** Not configured
**Tools:** No coverage reporting setup
**Gaps:** Missing coverage metrics and thresholds

## Test Data

**Fixtures:** None identified
**Mocks:** No external service mocking
**Environment:** Relies on actual LLM calls (Ollama)

## Quality Gates

**Linting:** `yarn lint` (ESLint on src/)
**Formatting:** `yarn format:check` (Prettier)
**Combined:** `yarn lint:all` runs all checks

## Known Issues

- **Flaky tests:** LLM-dependent integration tests may be unreliable
- **No coverage:** Missing test coverage metrics
- **No E2E:** No end-to-end user journey tests
- **Slow tests:** 30-second timeouts indicate performance concerns
