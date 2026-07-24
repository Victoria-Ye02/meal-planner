import { describe, expect, it } from "vitest";

import { loginSchema, signupSchema } from "../lib/validations/auth";

describe("auth: signup validation", () => {
  it("accepts a valid email and password", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "supersecret123",
    });

    expect(result.success).toBe(true);
  });

  it("normalizes email casing/whitespace", () => {
    const result = signupSchema.safeParse({
      email: "  User@Example.com  ",
      password: "supersecret123",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({
      email: "not-an-email",
      password: "supersecret123",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing password", () => {
    const result = signupSchema.safeParse({ email: "user@example.com" });

    expect(result.success).toBe(false);
  });
});

describe("auth: login validation", () => {
  it("accepts any non-empty password with a valid email", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "x",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });

    expect(result.success).toBe(false);
  });
});
