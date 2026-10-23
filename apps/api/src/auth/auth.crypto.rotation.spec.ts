import { afterEach, describe, expect, it } from "vitest";
import { decryptPrivateValue, encryptPrivateValue } from "./auth.crypto";

describe("encryption key rotation", () => {
  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  });

  it("decrypts with the previous key during rotation", () => {
    process.env.APP_ENCRYPTION_KEY = "old-key-old-key-old-key-old-key";
    const ciphertext = encryptPrivateValue("923111111");

    process.env.APP_ENCRYPTION_KEY = "new-key-new-key-new-key-new-key";
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = "old-key-old-key-old-key-old-key";
    expect(decryptPrivateValue(ciphertext)).toBe("923111111");

    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
    expect(() => decryptPrivateValue(ciphertext)).toThrow();
  });
});
