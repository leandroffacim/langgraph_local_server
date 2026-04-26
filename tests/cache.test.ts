// tests/cache.test.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { Cache } from '../src/utils/cache.js';

describe('Cache', () => {
    let cache: Cache;
    const testFilePath = path.join(process.cwd(), 'test-file.txt');

    beforeEach(async () => {
        cache = new Cache({ defaultTtl: 1000, maxSize: 10 }); // 1 second TTL for testing
        // Create a test file
        await fs.writeFile(testFilePath, 'test content', 'utf-8');
    });

    afterEach(async () => {
        cache.clear();
        try {
            await fs.unlink(testFilePath);
        } catch {
            // Ignore if file doesn't exist
        }
    });

    describe('basic get/set operations', () => {
        it('should store and retrieve values', async () => {
            const key = 'test-key';
            const value = { data: 'test value' };

            await cache.set(key, value);
            const retrieved = await cache.get(key);

            expect(retrieved).toEqual(value);
        });

        it('should return null for non-existent keys', async () => {
            const retrieved = await cache.get('non-existent');
            expect(retrieved).toBeNull();
        });

        it('should overwrite existing values', async () => {
            const key = 'test-key';
            const value1 = 'value1';
            const value2 = 'value2';

            await cache.set(key, value1);
            await cache.set(key, value2);

            const retrieved = await cache.get(key);
            expect(retrieved).toBe(value2);
        });
    });

    describe('TTL functionality', () => {
        it('should expire entries after TTL', async () => {
            const key = 'ttl-test';
            const value = 'test value';

            await cache.set(key, value, { ttl: 100 }); // 100ms TTL

            // Should exist immediately
            expect(await cache.get(key)).toBe(value);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 150));

            // Should be expired
            expect(await cache.get(key)).toBeNull();
        });

        it('should use default TTL when not specified', async () => {
            const key = 'default-ttl-test';
            const value = 'test value';

            await cache.set(key, value);

            // Should exist initially
            expect(await cache.get(key)).toBe(value);

            // Wait for default TTL (1000ms)
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should be expired
            expect(await cache.get(key)).toBeNull();
        });
    });

    describe('file-based invalidation', () => {
        it('should invalidate cache when file changes', async () => {
            const key = 'file-test';
            const value = 'test value';

            await cache.set(key, value, { filePath: testFilePath });

            // Should exist initially
            expect(await cache.get(key)).toBe(value);

            // Modify file
            await fs.writeFile(testFilePath, 'modified content', 'utf-8');

            // Should be invalidated
            expect(await cache.get(key)).toBeNull();
        });

        it('should not invalidate when file unchanged', async () => {
            const key = 'file-unchanged-test';
            const value = 'test value';

            await cache.set(key, value, { filePath: testFilePath });

            // Should still exist
            expect(await cache.get(key)).toBe(value);
        });

        it('should handle missing files gracefully', async () => {
            const key = 'missing-file-test';
            const value = 'test value';
            const missingFilePath = 'non-existent-file.txt';

            await cache.set(key, value, { filePath: missingFilePath });

            // Should still work (no file hash to compare)
            expect(await cache.get(key)).toBe(value);
        });
    });

    describe('pattern-based invalidation', () => {
        it('should invalidate by string pattern', async () => {
            await cache.set('user-1', 'user1 data');
            await cache.set('user-2', 'user2 data');
            await cache.set('post-1', 'post1 data');

            const invalidated = await cache.invalidate('user-');

            expect(invalidated).toBe(2);
            expect(await cache.get('user-1')).toBeNull();
            expect(await cache.get('user-2')).toBeNull();
            expect(await cache.get('post-1')).toBe('post1 data');
        });

        it('should invalidate by regex pattern', async () => {
            await cache.set('test-123', 'data1');
            await cache.set('test-456', 'data2');
            await cache.set('other-123', 'data3');

            const invalidated = await cache.invalidate(/^test-/);

            expect(invalidated).toBe(2);
            expect(await cache.get('test-123')).toBeNull();
            expect(await cache.get('test-456')).toBeNull();
            expect(await cache.get('other-123')).toBe('data3');
        });

        it('should clear all cache when no pattern provided', async () => {
            await cache.set('key1', 'data1');
            await cache.set('key2', 'data2');

            const invalidated = await cache.invalidate();

            expect(invalidated).toBe(2);
            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBeNull();
        });
    });

    describe('file path invalidation', () => {
        it('should invalidate entries by file path', async () => {
            const otherFilePath = path.join(process.cwd(), 'other-file.txt');
            await fs.writeFile(otherFilePath, 'other content', 'utf-8');

            await cache.set('key1', 'data1', { filePath: testFilePath });
            await cache.set('key2', 'data2', { filePath: otherFilePath });
            await cache.set('key3', 'data3'); // No file path

            const invalidated = await cache.invalidate(undefined, testFilePath);

            expect(invalidated).toBe(1);
            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBe('data2');
            expect(await cache.get('key3')).toBe('data3');

            await fs.unlink(otherFilePath);
        });
    });

    describe('cache size limits', () => {
        it('should evict entries when max size reached', async () => {
            const smallCache = new Cache({ maxSize: 3, defaultTtl: 60000 });

            // Fill cache
            await smallCache.set('key1', 'data1');
            await smallCache.set('key2', 'data2');
            await smallCache.set('key3', 'data3');

            // Add one more (should trigger eviction)
            await smallCache.set('key4', 'data4');

            const stats = smallCache.getStats();
            expect(stats.size).toBeLessThanOrEqual(3);
        });
    });

    describe('statistics', () => {
        it('should provide cache statistics', async () => {
            await cache.set('key1', 'data1');
            await cache.set('key2', 'data2');

            const stats = cache.getStats();

            expect(stats.size).toBe(2);
            expect(stats.maxSize).toBe(10);
        });
    });

    describe('utility methods', () => {
        it('should check if key exists', async () => {
            await cache.set('existing', 'data');

            expect(await cache.has('existing')).toBe(true);
            expect(await cache.has('non-existing')).toBe(false);
        });

        it('should return all keys', async () => {
            await cache.set('key1', 'data1');
            await cache.set('key2', 'data2');

            const keys = cache.keys();
            expect(keys).toHaveLength(2);
            expect(keys).toContain('key1');
            expect(keys).toContain('key2');
        });

        it('should clear all entries', async () => {
            await cache.set('key1', 'data1');
            await cache.set('key2', 'data2');

            cache.clear();

            expect(cache.getStats().size).toBe(0);
            expect(await cache.get('key1')).toBeNull();
        });
    });

    describe('key generation', () => {
        it('should generate consistent keys for same input', async () => {
            // Test key consistency through cache behavior
            const cache = new Cache();
            const key1 = 'test-input';
            const key2 = 'test-input'; // Same input
            const value = 'test-value';

            await cache.set(key1, value);
            const result = await cache.get(key2);

            expect(result).toBe(value);
        });

        it('should generate different keys for different inputs', async () => {
            const cache = new Cache();

            await cache.set('input1', 'value1');
            await cache.set('input2', 'value2');

            expect(await cache.get('input1')).toBe('value1');
            expect(await cache.get('input2')).toBe('value2');
        });
    });
});
