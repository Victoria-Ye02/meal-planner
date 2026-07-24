import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn(),
}));

import { Prisma } from "../../app/generated/prisma/client";
import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/password";
import { POST } from "../../app/api/auth/signup/route";

const mockFindUnique = prisma.user.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreate = prisma.user.create as unknown as ReturnType<typeof vi.fn>;
const mockHashPassword = hashPassword as unknown as ReturnType<typeof vi.fn>;

const VALID_BODY = { email: "new-user@example.com", password: "supersecret123" };

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreate.mockReset();
    mockHashPassword.mockReset();

    mockFindUnique.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue("hashed-password");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a User with a hashed password and returns 201 with only the safe fields", async () => {
    const createdAt = new Date("2026-07-24T00:00:00.000Z");
    mockCreate.mockResolvedValue({
      id: "user-1",
      email: "new-user@example.com",
      createdAt,
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.user).toEqual({
      id: "user-1",
      email: "new-user@example.com",
      createdAt: createdAt.toISOString(),
    });

    // The plaintext password must never reach the database directly.
    expect(mockHashPassword).toHaveBeenCalledWith("supersecret123");
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        email: "new-user@example.com",
        passwordHash: "hashed-password",
        dietaryPreferences: [],
        allergies: [],
      },
      select: { id: true, email: true, createdAt: true },
    });
  });

  it("normalizes email casing/whitespace before checking for an existing user", async () => {
    mockCreate.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      createdAt: new Date(),
    });

    await POST(
      makeRequest({ email: "  User@Example.com  ", password: "supersecret123" }),
    );

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });

  it("returns 409 without hashing or creating when the email is already registered", async () => {
    mockFindUnique.mockResolvedValue({ id: "existing-user" });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toMatch(/already exists/i);
    expect(mockHashPassword).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns 409 (not a raw 500) on a race: findUnique missed but create hits the unique constraint", async () => {
    const uniqueConstraintError = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      {
        code: "P2002",
        message: "Unique constraint failed on the fields: (`email`)",
      },
    );
    mockCreate.mockRejectedValue(uniqueConstraintError);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toMatch(/already exists/i);
  });

  it("propagates non-unique-constraint errors instead of swallowing them", async () => {
    mockCreate.mockRejectedValue(new Error("unexpected database error"));

    await expect(POST(makeRequest(VALID_BODY))).rejects.toThrow(
      "unexpected database error",
    );
  });

  it("returns 400 for an invalid email", async () => {
    const response = await POST(
      makeRequest({ email: "not-an-email", password: "supersecret123" }),
    );

    expect(response.status).toBe(400);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for a password shorter than 8 characters", async () => {
    const response = await POST(
      makeRequest({ email: "new-user@example.com", password: "short" }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.issues.password).toBeDefined();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
