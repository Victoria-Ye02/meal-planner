import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    savedRecipe: {
      deleteMany: vi.fn(),
    },
  },
}));

import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { DELETE } from "../../app/api/recipes/save/[recipeId]/route";
import { POST } from "../../app/api/recipes/save/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<
  typeof vi.fn
>;
const mockDeleteMany = prisma.savedRecipe.deleteMany as unknown as ReturnType<
  typeof vi.fn
>;

const AUTHED_SESSION = { user: { id: "user-1", email: "user@example.com" } };
const VALID_BODY = {
  title: "Garlic Pasta",
  ingredients: ["pasta", "garlic"],
  instructions: "Boil pasta. Add garlic.",
};

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/recipes/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(recipeId: string) {
  return new Request(`http://localhost/api/recipes/save/${recipeId}`, {
    method: "DELETE",
  });
}

/**
 * `POST` runs its find-or-create-then-join logic inside
 * `prisma.$transaction(fn)`. To unit-test it without a real database, stub
 * `$transaction` to invoke `fn` with a fake `tx` client backed by the given
 * `recipe.create`/`savedRecipe.create` mocks.
 */
function stubTransaction({
  createRecipe,
}: {
  createRecipe?: (data: unknown) => { id: string };
} = {}) {
  const txRecipeCreate = vi
    .fn()
    .mockImplementation(async ({ data }: { data: unknown }) =>
      createRecipe
        ? createRecipe(data)
        : { id: "recipe-1", ...(data as Record<string, unknown>) },
    );
  const txSavedRecipeCreate = vi.fn().mockResolvedValue(undefined);

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      recipe: { create: txRecipeCreate },
      savedRecipe: { create: txSavedRecipeCreate },
    }),
  );

  return { txRecipeCreate, txSavedRecipeCreate };
}

describe("POST /api/recipes/save", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockTransaction.mockReset();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a Recipe and a SavedRecipe row and returns the new recipeId", async () => {
    const { txRecipeCreate, txSavedRecipeCreate } = stubTransaction();

    const response = await POST(makePostRequest(VALID_BODY));

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.recipeId).toBe("recipe-1");

    expect(txRecipeCreate).toHaveBeenCalledWith({
      data: {
        title: "Garlic Pasta",
        ingredients: ["pasta", "garlic"],
        instructions: "Boil pasta. Add garlic.",
        aiGenerated: true,
        createdBy: "user-1",
      },
    });
    expect(txSavedRecipeCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", recipeId: "recipe-1" },
    });
  });

  it("runs the Recipe create and SavedRecipe create inside a single transaction", async () => {
    stubTransaction();

    await POST(makePostRequest(VALID_BODY));

    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(makePostRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: { email: "user@example.com" } });

    const response = await POST(makePostRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty ingredients list", async () => {
    const response = await POST(
      makePostRequest({ ...VALID_BODY, ingredients: [] }),
    );

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing title", async () => {
    const response = await POST(
      makePostRequest({ ingredients: ["pasta"], instructions: "Boil." }),
    );

    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/api/recipes/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/recipes/save/[recipeId]", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockDeleteMany.mockReset();
    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockDeleteMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes the requesting user's SavedRecipe row for the given recipeId", async () => {
    const response = await DELETE(makeDeleteRequest("recipe-1"), {
      params: Promise.resolve({ recipeId: "recipe-1" }),
    });

    expect(response.status).toBe(204);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", recipeId: "recipe-1" },
    });
  });

  it("scopes the delete to the requesting user, not an arbitrary user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-2" } });

    await DELETE(makeDeleteRequest("recipe-1"), {
      params: Promise.resolve({ recipeId: "recipe-1" }),
    });

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-2", recipeId: "recipe-1" },
    });
  });

  it("is idempotent: returns success even if the SavedRecipe row doesn't exist", async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 });

    const response = await DELETE(makeDeleteRequest("recipe-missing"), {
      params: Promise.resolve({ recipeId: "recipe-missing" }),
    });

    expect(response.status).toBe(204);
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await DELETE(makeDeleteRequest("recipe-1"), {
      params: Promise.resolve({ recipeId: "recipe-1" }),
    });

    expect(response.status).toBe(401);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: { email: "user@example.com" } });

    const response = await DELETE(makeDeleteRequest("recipe-1"), {
      params: Promise.resolve({ recipeId: "recipe-1" }),
    });

    expect(response.status).toBe(401);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
