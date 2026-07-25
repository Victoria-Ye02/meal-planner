import { describe, expect, test } from "vitest";

import { buildRecipeEmbeddingText } from "@/lib/ai/recipeEmbeddingText";

describe("buildRecipeEmbeddingText", () => {
  test("combines title, ingredients, and instructions into one string", () => {
    const text = buildRecipeEmbeddingText({
      title: "Garlic Pasta",
      ingredients: ["pasta", "garlic", "olive oil"],
      instructions: "Boil pasta. Saute garlic. Combine.",
    });

    expect(text).toContain("Garlic Pasta");
    expect(text).toContain("pasta");
    expect(text).toContain("garlic");
    expect(text).toContain("Boil pasta");
  });

  test("produces the same output for the same input (deterministic, for reuse at save-time and query-time consistency)", () => {
    const input = {
      title: "Tacos",
      ingredients: ["tortilla", "beef"],
      instructions: "Cook beef. Fill tortillas.",
    };

    expect(buildRecipeEmbeddingText(input)).toBe(
      buildRecipeEmbeddingText(input),
    );
  });
});
