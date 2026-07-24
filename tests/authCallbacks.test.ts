import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: vi.fn(),
}));

import { prisma } from "../lib/db";
import { verifyPassword } from "../lib/password";
import {
  authorizeCredentials,
  jwtCallback,
  sessionCallback,
} from "../lib/authCallbacks";

const mockFindUnique = prisma.user.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const mockVerifyPassword = verifyPassword as unknown as ReturnType<
  typeof vi.fn
>;

describe("authorizeCredentials", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockVerifyPassword.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only the safe id/email fields on a correct email+password", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hashed",
    });
    mockVerifyPassword.mockResolvedValue(true);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "correct-password",
    });

    expect(result).toEqual({ id: "user-1", email: "user@example.com" });
    // The password hash must never be returned from this function — it
    // would otherwise end up encoded in the session JWT.
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("returns null for malformed credentials (fails the Zod schema) without querying the database", async () => {
    const result = await authorizeCredentials({
      email: "not-an-email",
      password: "correct-password",
    });

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null when no user exists for the given email", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await authorizeCredentials({
      email: "nobody@example.com",
      password: "whatever123",
    });

    expect(result).toBeNull();
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it("returns null when the password doesn't match", async () => {
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      passwordHash: "hashed",
    });
    mockVerifyPassword.mockResolvedValue(false);

    const result = await authorizeCredentials({
      email: "user@example.com",
      password: "wrong-password",
    });

    expect(result).toBeNull();
  });

  it("returns null for an empty/undefined credentials object", async () => {
    const result = await authorizeCredentials(undefined);

    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });
});

describe("jwtCallback", () => {
  it("copies the user's id onto the token on initial sign-in", async () => {
    const token = await jwtCallback({
      token: {},
      user: { id: "user-1", email: "user@example.com" },
    });

    expect(token.id).toBe("user-1");
  });

  it("leaves an existing token untouched on subsequent requests (no user object)", async () => {
    const token = await jwtCallback({ token: { id: "user-1" } });

    expect(token.id).toBe("user-1");
  });
});

describe("sessionCallback", () => {
  it("copies the token's id onto session.user.id", async () => {
    const session = await sessionCallback({
      session: { user: { email: "user@example.com" } },
      token: { id: "user-1" },
    });

    expect(session.user?.id).toBe("user-1");
  });

  it("leaves the session untouched when the token has no string id", async () => {
    const session = await sessionCallback({
      session: { user: { email: "user@example.com" } },
      token: {},
    });

    expect(session.user?.id).toBeUndefined();
  });
});
