import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {current, redis.call('TTL', KEYS[1])}
`;

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    this.redis = url ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (!this.redis || process.env.RATE_LIMIT_ENABLED === "false") {
      return { allowed: true, remaining: limit, retryAfter: 0 };
    }
    try {
      const [current, ttl] = (await this.redis.eval(
        SCRIPT,
        1,
        `rl:${key}`,
        windowSeconds,
      )) as [number, number];
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        retryAfter: Math.max(0, ttl > 0 ? ttl : windowSeconds),
      };
    } catch (error) {
      this.logger.warn(`rate limit unavailable: ${(error as Error).message}`);
      return { allowed: true, remaining: limit, retryAfter: 0 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.status === "ready") await this.redis.quit();
    else this.redis?.disconnect();
  }
}
