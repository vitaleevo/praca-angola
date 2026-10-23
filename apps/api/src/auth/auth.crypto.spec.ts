import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth.crypto";

describe("password hashing", () => {
  it("accepts the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
