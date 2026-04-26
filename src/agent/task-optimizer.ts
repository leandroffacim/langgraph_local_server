// task-optimizer.ts
import { Cache } from '../utils/cache.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { Task } from './state.js';

export interface TaskOptimizationResult {
    originalTask: Task;
    decomposedTasks: Task[];
    priority: number;
    estimatedComplexity: 'simple' | 'medium' | 'complex';
    canParallelize: boolean;
    cacheKey?: string;
}

export interface TaskOptimizerOptions {
    maxDecompositionDepth?: number;
    enableCaching?: boolean;
    performanceMonitor?: PerformanceMonitor;
}

export class TaskOptimizer {
    private cache?: Cache;
    private performanceMonitor?: PerformanceMonitor;
    private options: TaskOptimizerOptions;

    constructor(options: TaskOptimizerOptions = {}) {
        this.options = {
            maxDecompositionDepth: options.maxDecompositionDepth ?? 3,
            enableCaching: options.enableCaching ?? true,
            performanceMonitor: options.performanceMonitor,
        };

        this.performanceMonitor = options.performanceMonitor;

        if (this.options.enableCaching) {
            this.cache = new Cache({ defaultTtl: 30 * 60 * 1000 }); // 30 minutes
        }
    }

    /**
     * Analyze task complexity and determine if decomposition is needed
     */
    private analyzeComplexity(task: Task): {
        needsDecomposition: boolean;
        estimatedComplexity: 'simple' | 'medium' | 'complex';
        decompositionHints: string[];
    } {
        const description = task.description.toLowerCase();
        const hints: string[] = [];

        // Simple heuristics for complexity analysis
        const fileList = description.match(/files?:([^\n]*)/i)?.[1] || '';
        const complexityIndicators = {
            files: (fileList.split(',').length) || 1,
            interfaces: (description.match(/interface/gi) || []).length,
            functions: (description.match(/function/gi) || []).length,
            classes: (description.match(/class/gi) || []).length,
            integrations: (description.match(/integrat|connect|api/gi) || []).length,
        };

        const totalIndicators = Object.values(complexityIndicators).reduce((sum, count) => sum + count, 0);

        let complexity: 'simple' | 'medium' | 'complex';
        let needsDecomposition = false;

        if (totalIndicators <= 2) {
            complexity = 'simple';
        } else if (totalIndicators <= 6) {
            complexity = 'medium';
            needsDecomposition = totalIndicators > 3;
        } else {
            complexity = 'complex';
            needsDecomposition = true;
        }

        // Generate decomposition hints
        if (complexityIndicators.files > 1) {
            hints.push('Multiple files - consider separate tasks per file');
        }
        if (complexityIndicators.interfaces > 0) {
            hints.push('Interface definitions - can be done independently');
        }
        if (complexityIndicators.functions > 2) {
            hints.push('Multiple functions - consider functional decomposition');
        }
        if (complexityIndicators.integrations > 0) {
            hints.push('External integrations - consider separate integration task');
        }

        return {
            needsDecomposition,
            estimatedComplexity: complexity,
            decompositionHints: hints,
        };
    }

    /**
     * Decompose a complex task into smaller, manageable tasks
     */
    async decomposeComplex(task: Task): Promise<Task[]> {
        // Check cache first
        if (this.cache) {
            const cached = await this.cache.get<Task[]>(`decompose_${task.id}`);
            if (cached) {
                return cached;
            }
        }

        const analysis = this.analyzeComplexity(task);

        if (!analysis.needsDecomposition) {
            // Return original task if no decomposition needed
            const result = [task];
            if (this.cache) {
                await this.cache.set(`decompose_${task.id}`, result);
            }
            return result;
        }

        const decomposedTasks: Task[] = [];
        let subTaskCounter = 1;

        // Create sub-tasks based on complexity analysis
        if (analysis.estimatedComplexity === 'medium') {
            // For medium complexity, create 2-3 focused sub-tasks
            const baseId = task.id.replace(/t(\d+)/i, 't$1');

            // Setup/Infrastructure task
            decomposedTasks.push({
                id: `${baseId}_${subTaskCounter++}`,
                title: `Setup ${task.title.toLowerCase()}`,
                description: this.createSetupDescription(task),
                dependsOn: task.dependsOn,
                status: 'pending',
            });

            // Core implementation task
            decomposedTasks.push({
                id: `${baseId}_${subTaskCounter++}`,
                title: `Implement ${task.title.toLowerCase()}`,
                description: this.createImplementationDescription(task),
                dependsOn: [`${baseId}_1`],
                status: 'pending',
            });

        } else if (analysis.estimatedComplexity === 'complex') {
            // For complex tasks, create more granular decomposition
            const baseId = task.id.replace(/t(\d+)/i, 't$1');

            // Analysis/Design task
            decomposedTasks.push({
                id: `${baseId}_${subTaskCounter++}`,
                title: `Design ${task.title.toLowerCase()}`,
                description: this.createDesignDescription(task),
                dependsOn: task.dependsOn,
                status: 'pending',
            });

            // Core components
            decomposedTasks.push({
                id: `${baseId}_${subTaskCounter++}`,
                title: `Implement core ${task.title.toLowerCase()}`,
                description: this.createCoreDescription(task),
                dependsOn: [`${baseId}_1`],
                status: 'pending',
            });

            // Integration/Testing task
            decomposedTasks.push({
                id: `${baseId}_${subTaskCounter++}`,
                title: `Integrate ${task.title.toLowerCase()}`,
                description: this.createIntegrationDescription(task),
                dependsOn: [`${baseId}_2`],
                status: 'pending',
            });
        }

        // Cache the result
        if (this.cache) {
            await this.cache.set(`decompose_${task.id}`, decomposedTasks);
        }

        return decomposedTasks;
    }

    /**
     * Calculate task priority based on dependencies and performance metrics
     */
    async calculatePriority(task: Task, allTasks: Task[]): Promise<number> {
        let priority = 0;

        // Base priority from dependency depth (tasks with more dependents are higher priority)
        const dependentTasks = allTasks.filter(t => t.dependsOn.includes(task.id));
        priority += dependentTasks.length * 20; // Increased weight for dependents

        // Adjust based on performance history
        if (this.performanceMonitor) {
            const metrics = this.performanceMonitor.getMetrics(task.id);
            if (metrics) {
                // Tasks that failed recently get higher priority for retry
                if (!metrics.success) {
                    priority += 20;
                }
                // Tasks that took longer get slightly higher priority
                if (metrics.duration && metrics.duration > 30000) { // > 30 seconds
                    priority += 5;
                }
            }
        }

        // Complexity-based priority adjustment
        const analysis = this.analyzeComplexity(task);
        switch (analysis.estimatedComplexity) {
            case 'simple':
                priority += 1;
                break;
            case 'medium':
                priority += 5;
                break;
            case 'complex':
                priority += 10;
                break;
        }

        return priority;
    }

    /**
     * Optimize task execution order and identify parallelization opportunities
     */
    async optimizeExecution(tasks: Task[]): Promise<{
        optimizedOrder: Task[];
        parallelGroups: Task[][];
        optimizationResult: TaskOptimizationResult[];
    }> {
        const optimizationResults: TaskOptimizationResult[] = [];

        // Analyze each task
        for (const task of tasks) {
            const decomposed = await this.decomposeComplex(task);
            const priority = await this.calculatePriority(task, tasks);
            const analysis = this.analyzeComplexity(task);

            // Determine if task can be parallelized (no dependencies)
            const canParallelize = task.dependsOn.length === 0;

            const result: TaskOptimizationResult = {
                originalTask: task,
                decomposedTasks: decomposed,
                priority,
                estimatedComplexity: analysis.estimatedComplexity,
                canParallelize,
                cacheKey: this.options.enableCaching ? `task_${task.id}` : undefined,
            };

            optimizationResults.push(result);
        }

        // Sort by priority (higher priority first)
        optimizationResults.sort((a, b) => b.priority - a.priority);

        // Group parallel tasks
        const parallelGroups: Task[][] = [];
        const processedTasks = new Set<string>();

        for (const result of optimizationResults) {
            if (processedTasks.has(result.originalTask.id)) continue;

            const group: Task[] = [];

            // Find all tasks that can run in parallel with this one
            for (const otherResult of optimizationResults) {
                if (processedTasks.has(otherResult.originalTask.id)) continue;

                // Can parallelize if no dependencies between them
                const hasDependency = otherResult.originalTask.dependsOn.includes(result.originalTask.id) ||
                                    result.originalTask.dependsOn.includes(otherResult.originalTask.id);

                if (!hasDependency && otherResult.canParallelize) {
                    group.push(otherResult.originalTask);
                    processedTasks.add(otherResult.originalTask.id);
                }
            }

            if (group.length > 0) {
                parallelGroups.push(group);
            }
        }

        // Create optimized order (prioritize parallel groups, then sequential)
        const optimizedOrder: Task[] = [];
        const usedTasks = new Set<string>();

        // Add parallel groups first
        for (const group of parallelGroups) {
            optimizedOrder.push(...group);
            group.forEach(task => usedTasks.add(task.id));
        }

        // Add remaining tasks
        for (const result of optimizationResults) {
            if (!usedTasks.has(result.originalTask.id)) {
                optimizedOrder.push(result.originalTask);
            }
        }

        return {
            optimizedOrder,
            parallelGroups,
            optimizationResult: optimizationResults,
        };
    }

    /**
     * Helper methods for creating task descriptions
     */
    private createSetupDescription(originalTask: Task): string {
        return `FILES: Create necessary files and basic structure\n\n` +
               `INTERFACES & SIGNATURES: Define types and interfaces\n\n` +
               `IMPLEMENTATION NOTES: Set up basic scaffolding\n\n` +
               `DONE CRITERIA: Files created, interfaces defined, basic structure in place\n\n` +
               `Original task: ${originalTask.description}`;
    }

    private createImplementationDescription(originalTask: Task): string {
        return `FILES: Implement core functionality\n\n` +
               `INTERFACES & SIGNATURES: Implement required functions and methods\n\n` +
               `IMPLEMENTATION NOTES: Focus on core business logic\n\n` +
               `DONE CRITERIA: Core functionality working, all requirements implemented\n\n` +
               `Original task: ${originalTask.description}`;
    }

    private createDesignDescription(originalTask: Task): string {
        return `FILES: Create design documents and specifications\n\n` +
               `INTERFACES & SIGNATURES: Define detailed interfaces and contracts\n\n` +
               `IMPLEMENTATION NOTES: Analyze requirements and create detailed design\n\n` +
               `DONE CRITERIA: Design specifications complete, interfaces defined\n\n` +
               `Original task: ${originalTask.description}`;
    }

    private createCoreDescription(originalTask: Task): string {
        return `FILES: Implement core components and logic\n\n` +
               `INTERFACES & SIGNATURES: Implement core functions and classes\n\n` +
               `IMPLEMENTATION NOTES: Focus on main functionality\n\n` +
               `DONE CRITERIA: Core components implemented and functional\n\n` +
               `Original task: ${originalTask.description}`;
    }

    private createIntegrationDescription(originalTask: Task): string {
        return `FILES: Integration and testing files\n\n` +
               `INTERFACES & SIGNATURES: Integration interfaces and test functions\n\n` +
               `IMPLEMENTATION NOTES: Connect components and add integration tests\n\n` +
               `DONE CRITERIA: All components integrated, integration tests passing\n\n` +
               `Original task: ${originalTask.description}`;
    }

    /**
     * Get performance insights for task optimization
     */
    getPerformanceInsights(): {
        cacheHitRate?: number;
        averageTaskDuration?: number;
        commonFailurePatterns?: string[];
    } {
        const insights: any = {};

        if (this.cache) {
            // Note: Cache doesn't expose hit rate directly, would need enhancement
        }

        if (this.performanceMonitor) {
            const allMetrics = this.performanceMonitor.getAllMetrics();
            if (allMetrics.length > 0) {
                const successfulTasks = allMetrics.filter(m => m.success);
                if (successfulTasks.length > 0) {
                    insights.averageTaskDuration = successfulTasks.reduce((sum, m) => sum + (m.duration || 0), 0) / successfulTasks.length;
                }

                const failures = allMetrics.filter(m => !m.success && m.errors);
                if (failures.length > 0) {
                    const errorPatterns = failures.flatMap(m => m.errors || []);
                    insights.commonFailurePatterns = this.extractCommonPatterns(errorPatterns);
                }
            }
        }

        return insights;
    }

    private extractCommonPatterns(errors: string[]): string[] {
        const patterns: { [key: string]: number } = {};

        for (const error of errors) {
            // Simple pattern extraction - could be enhanced
            const lowerError = error.toLowerCase();
            if (lowerError.includes('import')) {
                patterns['Import errors'] = (patterns['Import errors'] || 0) + 1;
            } else if (lowerError.includes('type')) {
                patterns['Type errors'] = (patterns['Type errors'] || 0) + 1;
            } else if (lowerError.includes('syntax')) {
                patterns['Syntax errors'] = (patterns['Syntax errors'] || 0) + 1;
            } else {
                patterns['Other errors'] = (patterns['Other errors'] || 0) + 1;
            }
        }

        return Object.entries(patterns)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([pattern]) => pattern);
    }
}
