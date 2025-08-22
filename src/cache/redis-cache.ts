import Redis, { RedisOptions, Cluster } from 'ioredis';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';

interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number;
  cluster?: boolean;
  sentinels?: Array<{ host: string; port: number }>;
  retryStrategy?: (times: number) => number | void;
}

interface CacheOptions {
  ttl?: number;
  nx?: boolean; // Only set if not exists
  xx?: boolean; // Only set if exists
}

export class RedisCache extends EventEmitter {
  private static instance: RedisCache;
  private client: Redis | Cluster;
  private subscriber: Redis;
  private publisher: Redis;
  private config: CacheConfig;
  private isConnected: boolean = false;
  private defaultTTL: number = 3600; // 1 hour
  private hits: number = 0;
  private misses: number = 0;

  private constructor() {
    super();
    this.config = this.buildConfig();
    this.client = this.createClient();
    this.subscriber = this.createClient();
    this.publisher = this.createClient();
    this.setupEventHandlers();
  }

  static getInstance(): RedisCache {
    if (!RedisCache.instance) {
      RedisCache.instance = new RedisCache();
    }
    return RedisCache.instance;
  }

  private buildConfig(): CacheConfig {
    return {
      host: config.redis?.host || process.env.REDIS_HOST || 'localhost',
      port: config.redis?.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: config.redis?.password || process.env.REDIS_PASSWORD,
      db: config.redis?.db || 0,
      keyPrefix: config.redis?.keyPrefix || 'claude:',
      ttl: config.redis?.ttl || this.defaultTTL,
      cluster: config.redis?.cluster || false,
      sentinels: config.redis?.sentinels,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis connection retry #${times}, delay: ${delay}ms`);
        return delay;
      }
    };
  }

  private createClient(): Redis | Cluster {
    const options: RedisOptions = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      retryStrategy: this.config.retryStrategy,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    if (this.config.cluster) {
      // Create cluster client
      return new Cluster([
        { host: this.config.host, port: this.config.port }
      ], {
        redisOptions: options,
        enableReadyCheck: true,
        maxRedirections: 16,
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 300
      });
    } else if (this.config.sentinels) {
      // Create sentinel client for HA
      return new Redis({
        sentinels: this.config.sentinels,
        name: 'mymaster',
        ...options
      });
    } else {
      // Create standalone client
      return new Redis(options);
    }
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
      this.emit('connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.emit('ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
      this.emit('error', error);
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.client.on('reconnecting', (delay: number) => {
      logger.info(`Redis reconnecting in ${delay}ms`);
    });

    // Setup pub/sub handlers
    this.subscriber.on('message', (channel: string, message: string) => {
      this.emit('message', channel, message);
    });

    this.subscriber.on('pmessage', (pattern: string, channel: string, message: string) => {
      this.emit('pmessage', pattern, channel, message);
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      await this.subscriber.connect();
      await this.publisher.connect();
      
      // Test connection
      await this.client.ping();
      
      logger.info('Redis cache connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      await this.subscriber.quit();
      await this.publisher.quit();
      
      this.isConnected = false;
      logger.info('Redis cache disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  // Basic cache operations
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      
      if (value) {
        this.hits++;
        this.emit('hit', key);
        return JSON.parse(value);
      } else {
        this.misses++;
        this.emit('miss', key);
        return null;
      }
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T = any>(
    key: string,
    value: T,
    options?: CacheOptions
  ): Promise<boolean> {
    try {
      const ttl = options?.ttl || this.config.ttl || this.defaultTTL;
      const serialized = JSON.stringify(value);
      
      let result: string | null;
      
      if (options?.nx) {
        result = await this.client.set(key, serialized, 'EX', ttl, 'NX');
      } else if (options?.xx) {
        result = await this.client.set(key, serialized, 'EX', ttl, 'XX');
      } else {
        result = await this.client.setex(key, ttl, serialized);
      }
      
      this.emit('set', key, ttl);
      return result === 'OK';
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      this.emit('delete', key);
      return result > 0;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      logger.error(`Cache expire error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      logger.error(`Cache TTL error for key ${key}:`, error);
      return -2; // Key does not exist
    }
  }

  // Batch operations
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(...keys);
      return values.map(v => v ? JSON.parse(v) : null);
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  async mset(items: Record<string, any>, ttl?: number): Promise<boolean> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const [key, value] of Object.entries(items)) {
        const serialized = JSON.stringify(value);
        if (ttl) {
          pipeline.setex(key, ttl, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }
      
      const results = await pipeline.exec();
      return results?.every(([err, result]) => !err && result === 'OK') ?? false;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  // Pattern operations
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`Cache keys error for pattern ${pattern}:`, error);
      return [];
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) return 0;
      
      return await this.client.del(...keys);
    } catch (error) {
      logger.error(`Cache delete pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  // List operations
  async lpush(key: string, ...values: any[]): Promise<number> {
    try {
      const serialized = values.map(v => JSON.stringify(v));
      return await this.client.lpush(key, ...serialized);
    } catch (error) {
      logger.error(`Cache lpush error for key ${key}:`, error);
      return 0;
    }
  }

  async rpush(key: string, ...values: any[]): Promise<number> {
    try {
      const serialized = values.map(v => JSON.stringify(v));
      return await this.client.rpush(key, ...serialized);
    } catch (error) {
      logger.error(`Cache rpush error for key ${key}:`, error);
      return 0;
    }
  }

  async lrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const values = await this.client.lrange(key, start, stop);
      return values.map(v => JSON.parse(v));
    } catch (error) {
      logger.error(`Cache lrange error for key ${key}:`, error);
      return [];
    }
  }

  // Hash operations
  async hset(key: string, field: string, value: any): Promise<number> {
    try {
      return await this.client.hset(key, field, JSON.stringify(value));
    } catch (error) {
      logger.error(`Cache hset error for key ${key}:`, error);
      return 0;
    }
  }

  async hget<T = any>(key: string, field: string): Promise<T | null> {
    try {
      const value = await this.client.hget(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache hget error for key ${key}:`, error);
      return null;
    }
  }

  async hgetall<T = any>(key: string): Promise<Record<string, T>> {
    try {
      const hash = await this.client.hgetall(key);
      const result: Record<string, T> = {};
      
      for (const [field, value] of Object.entries(hash)) {
        result[field] = JSON.parse(value);
      }
      
      return result;
    } catch (error) {
      logger.error(`Cache hgetall error for key ${key}:`, error);
      return {};
    }
  }

  // Set operations
  async sadd(key: string, ...members: any[]): Promise<number> {
    try {
      const serialized = members.map(m => JSON.stringify(m));
      return await this.client.sadd(key, ...serialized);
    } catch (error) {
      logger.error(`Cache sadd error for key ${key}:`, error);
      return 0;
    }
  }

  async smembers<T = any>(key: string): Promise<T[]> {
    try {
      const members = await this.client.smembers(key);
      return members.map(m => JSON.parse(m));
    } catch (error) {
      logger.error(`Cache smembers error for key ${key}:`, error);
      return [];
    }
  }

  async sismember(key: string, member: any): Promise<boolean> {
    try {
      const result = await this.client.sismember(key, JSON.stringify(member));
      return result === 1;
    } catch (error) {
      logger.error(`Cache sismember error for key ${key}:`, error);
      return false;
    }
  }

  // Sorted set operations
  async zadd(key: string, score: number, member: any): Promise<number> {
    try {
      return await this.client.zadd(key, score, JSON.stringify(member));
    } catch (error) {
      logger.error(`Cache zadd error for key ${key}:`, error);
      return 0;
    }
  }

  async zrange<T = any>(key: string, start: number, stop: number): Promise<T[]> {
    try {
      const members = await this.client.zrange(key, start, stop);
      return members.map(m => JSON.parse(m));
    } catch (error) {
      logger.error(`Cache zrange error for key ${key}:`, error);
      return [];
    }
  }

  // Pub/Sub operations
  async publish(channel: string, message: any): Promise<number> {
    try {
      return await this.publisher.publish(channel, JSON.stringify(message));
    } catch (error) {
      logger.error(`Publish error for channel ${channel}:`, error);
      return 0;
    }
  }

  async subscribe(channels: string | string[]): Promise<void> {
    try {
      await this.subscriber.subscribe(...(Array.isArray(channels) ? channels : [channels]));
      logger.info(`Subscribed to channels: ${channels}`);
    } catch (error) {
      logger.error('Subscribe error:', error);
      throw error;
    }
  }

  async unsubscribe(channels?: string | string[]): Promise<void> {
    try {
      if (channels) {
        await this.subscriber.unsubscribe(...(Array.isArray(channels) ? channels : [channels]));
      } else {
        await this.subscriber.unsubscribe();
      }
    } catch (error) {
      logger.error('Unsubscribe error:', error);
      throw error;
    }
  }

  async psubscribe(patterns: string | string[]): Promise<void> {
    try {
      await this.subscriber.psubscribe(...(Array.isArray(patterns) ? patterns : [patterns]));
      logger.info(`Pattern subscribed: ${patterns}`);
    } catch (error) {
      logger.error('Pattern subscribe error:', error);
      throw error;
    }
  }

  // Atomic operations
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Cache incr error for key ${key}:`, error);
      return 0;
    }
  }

  async incrby(key: string, increment: number): Promise<number> {
    try {
      return await this.client.incrby(key, increment);
    } catch (error) {
      logger.error(`Cache incrby error for key ${key}:`, error);
      return 0;
    }
  }

  async decr(key: string): Promise<number> {
    try {
      return await this.client.decr(key);
    } catch (error) {
      logger.error(`Cache decr error for key ${key}:`, error);
      return 0;
    }
  }

  // Transaction support
  async transaction(callback: (pipeline: any) => void): Promise<any[]> {
    const pipeline = this.client.pipeline();
    callback(pipeline);
    return await pipeline.exec();
  }

  // Lock mechanism for distributed systems
  async acquireLock(
    key: string,
    ttl: number = 30,
    retries: number = 10,
    retryDelay: number = 100
  ): Promise<string | null> {
    const lockKey = `lock:${key}`;
    const lockValue = `${Date.now()}:${Math.random()}`;
    
    for (let i = 0; i < retries; i++) {
      const acquired = await this.set(lockKey, lockValue, { ttl, nx: true });
      
      if (acquired) {
        return lockValue;
      }
      
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    
    return null;
  }

  async releaseLock(key: string, lockValue: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      const result = await this.client.eval(script, 1, lockKey, lockValue);
      return result === 1;
    } catch (error) {
      logger.error(`Failed to release lock for key ${key}:`, error);
      return false;
    }
  }

  // Session management
  async getSession(sessionId: string): Promise<any> {
    return await this.hgetall(`session:${sessionId}`);
  }

  async setSession(sessionId: string, data: any, ttl: number = 1800): Promise<void> {
    const key = `session:${sessionId}`;
    const pipeline = this.client.pipeline();
    
    for (const [field, value] of Object.entries(data)) {
      pipeline.hset(key, field, JSON.stringify(value));
    }
    
    pipeline.expire(key, ttl);
    await pipeline.exec();
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return await this.delete(`session:${sessionId}`);
  }

  async touchSession(sessionId: string, ttl: number = 1800): Promise<boolean> {
    return await this.expire(`session:${sessionId}`, ttl);
  }

  // Rate limiting
  async checkRateLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const windowStart = now - window * 1000;
    const rateLimitKey = `ratelimit:${key}`;
    
    // Remove old entries
    await this.client.zremrangebyscore(rateLimitKey, '-inf', windowStart);
    
    // Count current entries
    const count = await this.client.zcard(rateLimitKey);
    
    if (count < limit) {
      // Add new entry
      await this.client.zadd(rateLimitKey, now, `${now}:${Math.random()}`);
      await this.client.expire(rateLimitKey, window);
      
      return {
        allowed: true,
        remaining: limit - count - 1,
        resetAt: now + window * 1000
      };
    }
    
    // Get oldest entry to determine reset time
    const oldest = await this.client.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
    const resetAt = oldest.length > 1 ? parseInt(oldest[1]) + window * 1000 : now + window * 1000;
    
    return {
      allowed: false,
      remaining: 0,
      resetAt
    };
  }

  // Cache warming
  async warmCache(loader: () => Promise<Record<string, any>>): Promise<void> {
    try {
      const data = await loader();
      await this.mset(data, this.config.ttl);
      logger.info(`Cache warmed with ${Object.keys(data).length} keys`);
    } catch (error) {
      logger.error('Cache warming error:', error);
    }
  }

  // Statistics
  getStats(): any {
    const hitRate = this.hits + this.misses > 0
      ? (this.hits / (this.hits + this.misses)) * 100
      : 0;
    
    return {
      connected: this.isConnected,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate.toFixed(2)}%`,
      operations: this.hits + this.misses
    };
  }

  async getInfo(): Promise<any> {
    try {
      const info = await this.client.info();
      return info;
    } catch (error) {
      logger.error('Failed to get Redis info:', error);
      return null;
    }
  }

  async flush(): Promise<void> {
    try {
      await this.client.flushdb();
      logger.warn('Cache flushed');
    } catch (error) {
      logger.error('Failed to flush cache:', error);
      throw error;
    }
  }
}