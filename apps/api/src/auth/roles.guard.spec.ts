import { describe, expect, it, vi } from "vitest";
import { RolesGuard } from "./roles.guard";

function guard(required: string[], roles: string[]) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { id: "user-1", roles } }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return new RolesGuard(reflector as never).canActivate(context as never);
}

describe("RolesGuard platform owner boundaries", () => {
  it.each(["moderator", "administrator"])("lets the platform owner use %s administration routes", (role) => {
    expect(guard([role], ["buyer", "platform_owner"])).toBe(true);
  });

  it("does not treat the platform owner role as a store or buyer role", () => {
    expect(() => guard(["buyer"], ["platform_owner"])).toThrowError();
  });

  it("keeps global owner routes restricted to the platform owner", () => {
    expect(() => guard(["platform_owner"], ["buyer", "administrator"])).toThrowError();
    expect(guard(["platform_owner"], ["platform_owner"])).toBe(true);
  });

  it("does not elevate a regular buyer to moderation", () => {
    expect(() => guard(["moderator", "administrator"], ["buyer"])).toThrowError();
  });
});
