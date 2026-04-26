// tests/task-optimizer.test.ts
import { PerformanceMonitor } from '../src/agent/performance-monitor.js';
import { Task } from '../src/agent/state.js';
import { TaskOptimizer } from '../src/agent/task-optimizer.js';

describe('TaskOptimizer', () => {
    let optimizer: TaskOptimizer;
    let performanceMonitor: PerformanceMonitor;

    beforeEach(() => {
        performanceMonitor = new PerformanceMonitor();
        optimizer = new TaskOptimizer({
            performanceMonitor,
            enableCaching: false, // Disable for testing
        });
    });

    afterEach(() => {
        performanceMonitor.clear();
    });

    describe('task complexity analysis', () => {
        it('should identify simple tasks', () => {
            const simpleTask: Task = {
                id: 't1',
                title: 'Create simple function',
                description: 'FILES: src/utils/helper.ts\n\nINTERFACES & SIGNATURES: export function helper(): void\n\nDONE CRITERIA: Function exists',
                dependsOn: [],
                status: 'pending',
            };

            const analysis = (optimizer as any).analyzeComplexity(simpleTask);

            expect(analysis.needsDecomposition).toBe(false);
            expect(analysis.estimatedComplexity).toBe('simple');
        });

        it('should identify medium complexity tasks', () => {
            const mediumTask: Task = {
                id: 't2',
                title: 'Create service with multiple functions',
                description: 'FILES: src/services/userService.ts\n\nINTERFACES & SIGNATURES: export function createUser(): User; export function getUser(): User; export function updateUser(): User\n\nDONE CRITERIA: All functions implemented',
                dependsOn: [],
                status: 'pending',
            };

            const analysis = (optimizer as any).analyzeComplexity(mediumTask);

            expect(analysis.needsDecomposition).toBe(true);
            expect(analysis.estimatedComplexity).toBe('medium');
            expect(analysis.decompositionHints).toContain('Multiple functions - consider functional decomposition');
        });

        it('should identify complex tasks', () => {
            const complexTask: Task = {
                id: 't3',
                title: 'Create full API integration',
                description: 'FILES: src/api/client.ts, src/api/types.ts, src/api/endpoints.ts, src/services/apiService.ts\n\nINTERFACES & SIGNATURES: export class ApiClient {}; export interface ApiResponse {}; export function connect(): Promise<void>; export function fetchData(): Promise<Data>\n\nIMPLEMENTATION NOTES: Handle authentication, error handling, retries\n\nDONE CRITERIA: Full API integration working',
                dependsOn: [],
                status: 'pending',
            };

            const analysis = (optimizer as any).analyzeComplexity(complexTask);

            expect(analysis.needsDecomposition).toBe(true);
            expect(analysis.estimatedComplexity).toBe('complex');
            expect(analysis.decompositionHints).toContain('Multiple files - consider separate tasks per file');
        });
    });

    describe('task decomposition', () => {
        it('should not decompose simple tasks', async () => {
            const simpleTask: Task = {
                id: 't1',
                title: 'Simple task',
                description: 'FILES: file.ts\n\nINTERFACES & SIGNATURES: function simple()\n\nDONE CRITERIA: Done',
                dependsOn: [],
                status: 'pending',
            };

            const decomposed = await optimizer.decomposeComplex(simpleTask);

            expect(decomposed).toHaveLength(1);
            expect(decomposed[0]).toBe(simpleTask);
        });

        it('should decompose medium complexity tasks', async () => {
            const mediumTask: Task = {
                id: 't2',
                title: 'Medium task',
                description: 'FILES: file1.ts, file2.ts\n\nINTERFACES & SIGNATURES: function func1(); function func2(); function func3()\n\nDONE CRITERIA: All done',
                dependsOn: [],
                status: 'pending',
            };

            const decomposed = await optimizer.decomposeComplex(mediumTask);

            expect(decomposed).toHaveLength(2);
            expect(decomposed[0].id).toBe('t2_1');
            expect(decomposed[0].title).toBe('Setup medium task');
            expect(decomposed[1].id).toBe('t2_2');
            expect(decomposed[1].title).toBe('Implement medium task');
            expect(decomposed[1].dependsOn).toEqual(['t2_1']);
        });

        it('should decompose complex tasks', async () => {
            const complexTask: Task = {
                id: 't3',
                title: 'Complex task',
                description: 'FILES: file1.ts, file2.ts, file3.ts\n\nINTERFACES & SIGNATURES: class Complex {}; interface IComplex {}; function func1(); function func2(); function func3(); function func4()\n\nIMPLEMENTATION NOTES: Complex integration\n\nDONE CRITERIA: All integrated',
                dependsOn: [],
                status: 'pending',
            };

            const decomposed = await optimizer.decomposeComplex(complexTask);

            expect(decomposed).toHaveLength(3);
            expect(decomposed[0].id).toBe('t3_1');
            expect(decomposed[0].title).toBe('Design complex task');
            expect(decomposed[1].id).toBe('t3_2');
            expect(decomposed[1].title).toBe('Implement core complex task');
            expect(decomposed[1].dependsOn).toEqual(['t3_1']);
            expect(decomposed[2].id).toBe('t3_3');
            expect(decomposed[2].title).toBe('Integrate complex task');
            expect(decomposed[2].dependsOn).toEqual(['t3_2']);
        });
    });

    describe('priority calculation', () => {
        it('should calculate priority based on dependencies', async () => {
            const tasks: Task[] = [
                { id: 't1', title: 'Task 1', description: 'Simple', dependsOn: [], status: 'pending' },
                { id: 't2', title: 'Task 2', description: 'Depends on t1', dependsOn: ['t1'], status: 'pending' },
                { id: 't3', title: 'Task 3', description: 'Depends on t1 and t2', dependsOn: ['t1', 't2'], status: 'pending' },
            ];

            const priority1 = await optimizer.calculatePriority(tasks[0], tasks);
            const priority2 = await optimizer.calculatePriority(tasks[1], tasks);
            const priority3 = await optimizer.calculatePriority(tasks[2], tasks);

            const priority1 = await optimizer.calculatePriority(tasks[0], tasks);
            const priority2 = await optimizer.calculatePriority(tasks[1], tasks);
            const priority3 = await optimizer.calculatePriority(tasks[2], tasks);

            // t1 should have highest priority (2 dependents: t2, t3)
            // t2 should have medium priority (1 dependent: t3)
            // t3 should have lowest priority (0 dependents)
            expect(priority1).toBeGreaterThan(priority2);
            expect(priority2).toBeGreaterThan(priority3);
        });

        it('should adjust priority based on performance history', async () => {
            // Add performance data
            performanceMonitor.startTask('failed-task');
            performanceMonitor.endTask('failed-task', false, 0, ['Error occurred']);

            performanceMonitor.startTask('slow-task');
            await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
            performanceMonitor.endTask('slow-task', true, 5);

            const failedTask: Task = {
                id: 'failed-task',
                title: 'Failed task',
                description: 'Simple',
                dependsOn: [],
                status: 'pending',
            };

            const slowTask: Task = {
                id: 'slow-task',
                title: 'Slow task',
                description: 'Simple',
                dependsOn: [],
                status: 'pending',
            };

            const normalTask: Task = {
                id: 'normal-task',
                title: 'Normal task',
                description: 'Simple',
                dependsOn: [],
                status: 'pending',
            };

            const failedPriority = await optimizer.calculatePriority(failedTask, [failedTask]);
            const slowPriority = await optimizer.calculatePriority(slowTask, [slowTask]);
            const normalPriority = await optimizer.calculatePriority(normalTask, [normalTask]);

            // Failed task should have highest priority
            expect(failedPriority).toBeGreaterThan(slowPriority);
            expect(slowPriority).toBeGreaterThan(normalPriority);
        });

        it('should adjust priority based on complexity', async () => {
            const simpleTask: Task = {
                id: 'simple',
                title: 'Simple',
                description: 'FILES: file.ts\n\nDONE CRITERIA: Done',
                dependsOn: [],
                status: 'pending',
            };

            const complexTask: Task = {
                id: 'complex',
                title: 'Complex',
                description: 'FILES: f1.ts, f2.ts, f3.ts\n\nINTERFACES & SIGNATURES: class C {}; interface I {}; function f1(); function f2(); function f3(); function f4()\n\nDONE CRITERIA: All done',
                dependsOn: [],
                status: 'pending',
            };

            const simplePriority = await optimizer.calculatePriority(simpleTask, [simpleTask]);
            const complexPriority = await optimizer.calculatePriority(complexTask, [complexTask]);

            expect(complexPriority).toBeGreaterThan(simplePriority);
        });
    });

    describe('execution optimization', () => {
        it('should optimize task order by priority', async () => {
            const tasks: Task[] = [
                {
                    id: 'low-priority',
                    title: 'Low priority',
                    description: 'FILES: file.ts\n\nDONE CRITERIA: Done',
                    dependsOn: [],
                    status: 'pending',
                },
                {
                    id: 'high-priority',
                    title: 'High priority',
                    description: 'FILES: f1.ts, f2.ts, f3.ts\n\nINTERFACES & SIGNATURES: class C {}; function f1(); function f2(); function f3()\n\nDONE CRITERIA: All done',
                    dependsOn: [],
                    status: 'pending',
                },
            ];

            const result = await optimizer.optimizeExecution(tasks);

            // High priority task should come first
            expect(result.optimizedOrder[0].id).toBe('high-priority');
            expect(result.optimizedOrder[1].id).toBe('low-priority');
        });

        it('should identify parallel execution opportunities', async () => {
            const tasks: Task[] = [
                {
                    id: 'independent-1',
                    title: 'Independent 1',
                    description: 'FILES: file1.ts\n\nDONE CRITERIA: Done',
                    dependsOn: [],
                    status: 'pending',
                },
                {
                    id: 'independent-2',
                    title: 'Independent 2',
                    description: 'FILES: file2.ts\n\nDONE CRITERIA: Done',
                    dependsOn: [],
                    status: 'pending',
                },
                {
                    id: 'dependent',
                    title: 'Dependent',
                    description: 'FILES: file3.ts\n\nDONE CRITERIA: Done',
                    dependsOn: ['independent-1'],
                    status: 'pending',
                },
            ];

            const result = await optimizer.optimizeExecution(tasks);

            // Should have at least one parallel group
            expect(result.parallelGroups.length).toBeGreaterThan(0);

            // Independent tasks should be in parallel groups
            const parallelTasks = result.parallelGroups.flat();
            expect(parallelTasks.some(t => t.id === 'independent-1')).toBe(true);
            expect(parallelTasks.some(t => t.id === 'independent-2')).toBe(true);
        });

        it('should respect dependencies in optimization', async () => {
            const tasks: Task[] = [
                {
                    id: 'task-a',
                    title: 'Task A',
                    description: 'FILES: a.ts\n\nDONE CRITERIA: Done',
                    dependsOn: [],
                    status: 'pending',
                },
                {
                    id: 'task-b',
                    title: 'Task B',
                    description: 'FILES: b.ts\n\nDONE CRITERIA: Done',
                    dependsOn: ['task-a'],
                    status: 'pending',
                },
                {
                    id: 'task-c',
                    title: 'Task C',
                    description: 'FILES: c.ts\n\nDONE CRITERIA: Done',
                    dependsOn: ['task-b'],
                    status: 'pending',
                },
            ];

            const result = await optimizer.optimizeExecution(tasks);

            // Find positions in optimized order
            const positions: { [key: string]: number } = {};
            result.optimizedOrder.forEach((task, index) => {
                positions[task.id] = index;
            });

            // Dependencies should be respected
            expect(positions['task-a']).toBeLessThan(positions['task-b']);
            expect(positions['task-b']).toBeLessThan(positions['task-c']);
        });
    });

    describe('performance insights', () => {
        it('should provide performance insights', () => {
            // Add some performance data
            performanceMonitor.startTask('success-task');
            performanceMonitor.endTask('success-task', true, 3);

            performanceMonitor.startTask('failed-task');
            performanceMonitor.endTask('failed-task', false, 0, ['Import error', 'Type error']);

            const insights = optimizer.getPerformanceInsights();

            expect(insights.averageTaskDuration).toBeDefined();
            expect(insights.commonFailurePatterns).toBeDefined();
            expect(insights.commonFailurePatterns!.length).toBeGreaterThan(0);
        });

        it('should handle empty performance data', () => {
            const insights = optimizer.getPerformanceInsights();

            expect(insights.averageTaskDuration).toBeUndefined();
            expect(insights.commonFailurePatterns).toBeUndefined();
        });
    });

    describe('caching integration', () => {
        it('should cache decomposition results when enabled', async () => {
            const optimizerWithCache = new TaskOptimizer({
                enableCaching: true,
                performanceMonitor,
            });

            const task: Task = {
                id: 'cache-test',
                title: 'Cache test',
                description: 'FILES: test.ts\n\nINTERFACES & SIGNATURES: function test()\n\nDONE CRITERIA: Done',
                dependsOn: [],
                status: 'pending',
            };

            // First call should compute and cache
            const result1 = await optimizerWithCache.decomposeComplex(task);

            // Second call should use cache
            const result2 = await optimizerWithCache.decomposeComplex(task);

            expect(result1).toEqual(result2);
        });
    });
});
