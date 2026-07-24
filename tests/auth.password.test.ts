import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../lib/password";

describe("auth: password hashing", () => {
  it("never stores the plaintext password in the hash", async () => {
    const plainTextPassword = "correct horse battery staple";
    const hash = await hashPassword(plainTextPassword);

    expect(hash).not.toBe(plainTextPassword);
    expect(hash).not.toContain(plainTextPassword);
  });

  it("produces a bcrypt-formatted hash", async () => {
    const hash = await hashPassword("some-password123");
    // bcrypt hashes are prefixed with $2a$, $2b$, or $2y$ followed by the cost.
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it("verifies a correct password against its hash", async () => {
    const plainTextPassword = "hunter2-hunter2";
    const hash = await hashPassword(plainTextPassword);

    await expect(verifyPassword(plainTextPassword, hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password against a hash", async () => {
    const hash = await hashPassword("the-real-password");

    await expect(verifyPassword("not-the-real-password", hash)).resolves.toBe(
      false,
    );
  });

  it("produces a different hash each time (random salt)", async () => {
    const plainTextPassword = "same-password";
    const [hashA, hashB] = await Promise.all([
      hashPassword(plainTextPassword),
      hashPassword(plainTextPassword),
    ]);

    expect(hashA).not.toBe(hashB);
  });
});
