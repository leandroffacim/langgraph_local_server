// tests/performance-monitor.test.ts
import { PerformanceMonitor } from '../src/agent/performance-monitor.js';

describe('PerformanceMonitor', () => {
    let monitor: PerformanceMonitor;

    beforeEach(() => {
        monitor = new PerformanceMonitor();
    });

    afterEach(() => {
        monitor.clear();
    });

    describe('startTask', () => {
        it('should start monitoring a task successfully', () => {
            const taskId = 'task_1';

            expect(() => monitor.startTask(taskId)).not.toThrow();

            const metrics = monitor.getMetrics(taskId);
            expect(metrics).toBeDefined();
            expect(metrics!.taskId).toBe(taskId);
            expect(metrics!.startTime).toBeGreaterThan(0);
            expect(metrics!.success).toBe(false);
            expect(metrics!.toolCalls).toBe(0);
            expect(metrics!.endTime).toBeUndefined();
            expect(metrics!.duration).toBeUndefined();
        });

        it('should throw error when starting already active task', () => {
            const taskId = 'task_1';
            monitor.startTask(taskId);

            expect(() => monitor.startTask(taskId)).toThrow('Task task_1 is already being monitored');
        });
    });

    describe('endTask', () => {
        it('should end monitoring a task successfully', () => {
            const taskId = 'task_1';
            monitor.startTask(taskId);

            expect(() => monitor.endTask(taskId, true, 2)).not.toThrow();

            const metrics = monitor.getMetrics(taskId);
            expect(metrics).toBeDefined();
            expect(metrics!.success).toBe(true);
            expect(metrics!.toolCalls).toBe(2);
            expect(metrics!.endTime).toBeDefined();
            expect(metrics!.endTime).toBeGreaterThanOrEqual(metrics!.startTime);
            expect(metrics!.duration).toBeGreaterThanOrEqual(0);
        });

        it('should record errors when provided', () => {
            const taskId = 'task_1';
            const errors = ['Error 1', 'Error 2'];
            monitor.startTask(taskId);

            monitor.endTask(taskId, false, 0, errors);

            const metrics = monitor.getMetrics(taskId);
            expect(metrics!.success).toBe(false);
            expect(metrics!.errors).toEqual(errors);
        });

        it('should throw error when ending non-existent task', () => {
            expect(() => monitor.endTask('non_existent', true)).toThrow('Task non_existent was not started');
        });

        it('should throw error when ending inactive task', () => {
            const taskId = 'task_1';
            monitor.startTask(taskId);
            monitor.endTask(taskId, true);

            expect(() => monitor.endTask(taskId, true)).toThrow('Task task_1 is not currently active');
        });
    });

    describe('getMetrics', () => {
        it('should return metrics for existing task', () => {
            const taskId = 'task_1';
            monitor.startTask(taskId);

            const metrics = monitor.getMetrics(taskId);
            expect(metrics).toBeDefined();
            expect(metrics!.taskId).toBe(taskId);
        });

        it('should return undefined for non-existent task', () => {
            const metrics = monitor.getMetrics('non_existent');
            expect(metrics).toBeUndefined();
        });
    });

    describe('getAllMetrics', () => {
        it('should return all collected metrics', () => {
            monitor.startTask('task_1');
            monitor.startTask('task_2');
            monitor.endTask('task_1', true, 1);

            const allMetrics = monitor.getAllMetrics();
            expect(allMetrics).toHaveLength(2);

            const task1Metrics = allMetrics.find(m => m.taskId === 'task_1');
            const task2Metrics = allMetrics.find(m => m.taskId === 'task_2');

            expect(task1Metrics).toBeDefined();
            expect(task1Metrics!.success).toBe(true);
            expect(task1Metrics!.toolCalls).toBe(1);

            expect(task2Metrics).toBeDefined();
            expect(task2Metrics!.success).toBe(false);
            expect(task2Metrics!.endTime).toBeUndefined();
        });
    });

    describe('getActiveTasks', () => {
        it('should return only active tasks', () => {
            monitor.startTask('task_1');
            monitor.startTask('task_2');
            monitor.endTask('task_1', true);

            const activeTasks = monitor.getActiveTasks();
            expect(activeTasks).toHaveLength(1);
            expect(activeTasks[0].taskId).toBe('task_2');
        });

        it('should return empty array when no active tasks', () => {
            const activeTasks = monitor.getActiveTasks();
            expect(activeTasks).toHaveLength(0);
        });
    });

    describe('clear', () => {
        it('should clear all metrics and active tasks', () => {
            monitor.startTask('task_1');
            monitor.startTask('task_2');

            monitor.clear();

            expect(monitor.getAllMetrics()).toHaveLength(0);
            expect(monitor.getActiveTasks()).toHaveLength(0);
            expect(monitor.getMetrics('task_1')).toBeUndefined();
        });
    });
});