import { describe, expect, it, vi } from "vitest";
import { RateLimitGuard } from "./rate-limit.guard";

describe("RateLimitGuard", () => {
  it("throws 429 when the limiter denies the request", async () => {
    const limiter = {
      consume: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 42 }),
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ scope: "message", limit: 30, windowSeconds: 60 }),
    };
    const guard = new RateLimitGuard(limiter as never, reflector as never);
    const response = { setHeader: vi.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: "u1" }, ip: "127.0.0.1" }),
        getResponse: () => response,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({ status: 429 });
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "42");
  });

  it("allows the request when no rule is present", async () => {
    const limiter = { consume: vi.fn() };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new RateLimitGuard(limiter as never, reflector as never);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
