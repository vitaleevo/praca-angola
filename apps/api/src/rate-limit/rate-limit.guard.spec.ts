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

  it("limits auth by normalized email without storing it in the key", async () => {
    const limiter = {
      consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 1, retryAfter: 0 }),
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({
        scope: "auth-login", subject: "email", limit: 20, windowSeconds: 900,
        sourceLimit: { limit: 3000, windowSeconds: 3600 },
      }),
    };
    const guard = new RateLimitGuard(limiter as never, reflector as never);
    const request = { ip: "192.0.2.5", body: { email: "  CLIENTE@EXAMPLE.COM  " } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    const keys = limiter.consume.mock.calls.map((call) => call[0] as string);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe("auth-login:source:192.0.2.5");
    expect(keys[1]).toMatch(/^auth-login:email:[a-f0-9]{64}$/);
    expect(keys.join(" ")).not.toContain("CLIENTE");
    expect(keys.join(" ")).not.toContain("example.com");
  });
});
