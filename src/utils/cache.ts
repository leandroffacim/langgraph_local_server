// cache.ts
import * as crypto from 'crypto';
import * as fs from 'fs/promises';

export interface CacheEntry<T = any> {
    data: T;
    timestamp: number;
    ttl: number;
    fileHash?: string;
    filePath?: string;
}

export interface CacheOptions {
    defaultTtl?: number;
    maxSize?: number;
    enableFileTracking?: boolean;
}

export class Cache {
    private cache = new Map<string, CacheEntry>();
    private options: Required<CacheOptions>;

    constructor(options: CacheOptions = {}) {
        this.options = {
            defaultTtl: options.defaultTtl ?? 5 * 60 * 1000, // 5 minutes default
            maxSize: options.maxSize ?? 1000,
            enableFileTracking: options.enableFileTracking ?? true,
        };
    }

    /**
     * Calculate file hash for tracking changes
     */
    private async calculateFileHash(filePath: string): Promise<string | null> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return crypto.createHash('sha256').update(content).digest('hex');
        } catch {
            return null;
        }
    }

    /**
     * Check if cache entry is expired
     */
    private isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > entry.ttl;
    }

    /**
     * Check if file has changed since caching
     */
    private async hasFileChanged(entry: CacheEntry): Promise<boolean> {
        if (!entry.filePath || !entry.fileHash) {
            return false;
        }

        const currentHash = await this.calculateFileHash(entry.filePath);
        return currentHash !== entry.fileHash;
    }

    /**
     * Evict oldest entries if cache is full
     */
    private evictIfNeeded(): void {
        if (this.cache.size >= this.options.maxSize) {
            // Remove expired entries first
            for (const [key, entry] of this.cache.entries()) {
                if (this.isExpired(entry)) {
                    this.cache.delete(key);
                }
            }

            // If still full, remove oldest entries
            if (this.cache.size >= this.options.maxSize) {
                const entries = Array.from(this.cache.entries());
                entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);

                const toRemove = Math.ceil(this.options.maxSize * 0.1); // Remove 10%
                for (let i = 0; i < toRemove && entries.length > 0; i++) {
                    this.cache.delete(entries[i][0]);
                }
            }
        }
    }

    /**
     * Get cached value with TTL and file change validation
     */
    async get<T = any>(key: string): Promise<T | null> {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }

        // Check TTL expiration
        if (this.isExpired(entry)) {
            this.cache.delete(key);
            return null;
        }

        // Check file changes if tracking is enabled
        if (this.options.enableFileTracking && await this.hasFileChanged(entry)) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    /**
     * Set cache value with optional TTL and file tracking
     */
    async set<T = any>(
        key: string,
        data: T,
        options: {
            ttl?: number;
            filePath?: string;
        } = {}
    ): Promise<void> {
        this.evictIfNeeded();

        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: options.ttl ?? this.options.defaultTtl,
        };

        // Add file tracking if path provided
        if (options.filePath && this.options.enableFileTracking) {
            entry.filePath = options.filePath;
            const fileHash = await this.calculateFileHash(options.filePath);
            if (fileHash !== null) {
                entry.fileHash = fileHash;
            }
        }

        this.cache.set(key, entry);
    }

    /**
     * Invalidate cache entries by pattern or file path
     */
    async invalidate(pattern?: string | RegExp, filePath?: string): Promise<number> {
        let invalidated = 0;

        if (filePath) {
            // Invalidate entries related to specific file
            for (const [key, entry] of this.cache.entries()) {
                if (entry.filePath === filePath) {
                    this.cache.delete(key);
                    invalidated++;
                }
            }
        } else if (pattern) {
            // Invalidate entries matching key pattern
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
            for (const [key] of this.cache.entries()) {
                if (regex.test(key)) {
                    this.cache.delete(key);
                    invalidated++;
                }
            }
        } else {
            // Clear all cache
            invalidated = this.cache.size;
            this.cache.clear();
        }

        return invalidated;
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        size: number;
        maxSize: number;
        hitRate?: number;
    } {
        return {
            size: this.cache.size,
            maxSize: this.options.maxSize,
        };
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get all cache keys
     */
    keys(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Check if key exists and is valid
     */
    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }
}
