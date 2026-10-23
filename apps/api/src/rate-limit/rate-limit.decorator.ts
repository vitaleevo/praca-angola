import { SetMetadata } from "@nestjs/common";

export type RateLimitRule = { scope: string; limit: number; windowSeconds: number };
export const RATE_LIMIT_KEY = "rate_limit";
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);
