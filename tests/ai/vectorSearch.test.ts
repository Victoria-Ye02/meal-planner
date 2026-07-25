import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

import { prisma } from "../../lib/db";
import {
  findSimilarSavedRecipes,
  setSavedRecipeEmbedding,
} from "../../lib/ai/vectorSearch";

const mockExecuteRaw = prisma.$executeRawUnsafe as unknown as ReturnType<
  typeof vi.fn
>;
const mockQueryRaw = prisma.$queryRawUnsafe as unknown as ReturnType<
  typeof vi.fn
>;

describe("setSavedRecipeEmbedding", () => {
  beforeEach(() => {
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("issues a raw UPDATE scoped to the given userId and recipeId with a vector-cast parameter", async () => {
    const embedding = [0.1, 0.2, 0.3];

    await setSavedRecipeEmbedding({
      userId: "user-1",
      recipeId: "recipe-1",
      embedding,
    });

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const [sql, ...params] = mockExecuteRaw.mock.calls[0];
    expect(sql).toContain("UPDATE");
    expect(sql).toContain("SavedRecipe");
    expect(sql).toContain("::vector");
    expect(params).toContain("user-1");
    expect(params).toContain("recipe-1");
    expect(params.some((p) => typeof p === "string" && p.includes("0.1"))).toBe(
      true,
    );
  });
});

describe("findSimilarSavedRecipes", () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns rows from the raw query mapped to the expected shape", async () => {
    mockQueryRaw.mockResolvedValue([
      {
        recipeId: "recipe-1",
        title: "Garlic Pasta",
        ingredients: ["pasta", "garlic"],
        instructions: "Boil, saute, combine.",
        distance: 0.12,
      },
    ]);

    const results = await findSimilarSavedRecipes({
      userId: "user-1",
      queryEmbedding: [0.1, 0.2],
      limit: 5,
    });

    expect(results).toEqual([
      {
        recipeId: "recipe-1",
        title: "Garlic Pasta",
        ingredients: ["pasta", "garlic"],
        instructions: "Boil, saute, combine.",
      },
    ]);
  });

  it("scopes the query to the given userId and excludes rows with a NULL embedding", async () => {
    mockQueryRaw.mockResolvedValue([]);

    await findSimilarSavedRecipes({
      userId: "user-42",
      queryEmbedding: [0.5],
      limit: 3,
    });

    const [sql, ...params] = mockQueryRaw.mock.calls[0];
    expect(sql).toContain("IS NOT NULL");
    expect(sql).toContain("ORDER BY");
    expect(sql).toContain("<=>");
    expect(params).toContain("user-42");
    expect(params).toContain(3);
  });

  it("returns an empty array when no rows match", async () => {
    mockQueryRaw.mockResolvedValue([]);

    const results = await findSimilarSavedRecipes({
      userId: "user-1",
      queryEmbedding: [0.1],
      limit: 5,
    });

    expect(results).toEqual([]);
  });
});
