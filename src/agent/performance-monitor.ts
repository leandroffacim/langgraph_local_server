// performance-monitor.ts
export interface PerformanceMetrics {
    taskId: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    success: boolean;
    toolCalls: number;
    errors?: string[];
}

export class PerformanceMonitor {
    private metrics: Map<string, PerformanceMetrics> = new Map();
    private activeTasks: Set<string> = new Set();

    /**
     * Starts monitoring a task execution
     * @param taskId Unique identifier for the task
     */
    startTask(taskId: string): void {
        if (this.activeTasks.has(taskId)) {
            throw new Error(`Task ${taskId} is already being monitored`);
        }

        const metrics: PerformanceMetrics = {
            taskId,
            startTime: Date.now(),
            success: false,
            toolCalls: 0,
        };

        this.metrics.set(taskId, metrics);
        this.activeTasks.add(taskId);
    }

    /**
     * Ends monitoring a task execution
     * @param taskId Unique identifier for the task
     * @param success Whether the task completed successfully
     * @param toolCalls Number of tool calls made during execution
     * @param errors Optional array of error messages
     */
    endTask(taskId: string, success: boolean, toolCalls: number = 0, errors?: string[]): void {
        const metrics = this.metrics.get(taskId);
        if (!metrics) {
            throw new Error(`Task ${taskId} was not started`);
        }

        if (!this.activeTasks.has(taskId)) {
            throw new Error(`Task ${taskId} is not currently active`);
        }

        metrics.endTime = Date.now();
        metrics.duration = metrics.endTime - metrics.startTime;
        metrics.success = success;
        metrics.toolCalls = toolCalls;
        if (errors && errors.length > 0) {
            metrics.errors = errors;
        }

        this.activeTasks.delete(taskId);
    }

    /**
     * Gets performance metrics for a specific task
     * @param taskId Unique identifier for the task
     * @returns PerformanceMetrics or undefined if task not found
     */
    getMetrics(taskId: string): PerformanceMetrics | undefined {
        return this.metrics.get(taskId);
    }

    /**
     * Gets all collected performance metrics
     * @returns Array of all PerformanceMetrics
     */
    getAllMetrics(): PerformanceMetrics[] {
        return Array.from(this.metrics.values());
    }

    /**
     * Gets metrics for currently active tasks
     * @returns Array of PerformanceMetrics for active tasks
     */
    getActiveTasks(): PerformanceMetrics[] {
        return Array.from(this.activeTasks).map(taskId => this.metrics.get(taskId)!);
    }

    /**
     * Clears all metrics and active tasks
     */
    clear(): void {
        this.metrics.clear();
        this.activeTasks.clear();
    }
}