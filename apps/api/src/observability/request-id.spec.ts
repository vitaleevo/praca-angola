import { describe, expect, it } from "vitest";
import { normalizeRequestId } from "./request-id";

describe("normalizeRequestId", () => {
  it("keeps a valid client request id", () => {
    expect(normalizeRequestId("req-12345678")).toBe("req-12345678");
  });

  it("replaces newline injection with a UUID", () => {
    expect(normalizeRequestId("bad\nvalue")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("truncates values longer than 64 characters", () => {
    expect(normalizeRequestId("a".repeat(100))).toHaveLength(64);
  });
});
