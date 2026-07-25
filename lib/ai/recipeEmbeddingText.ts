/**
 * Builds the single text string a recipe's embedding is computed from.
 * Used both when a recipe is saved (lib/ai/embeddings.ts via the save
 * route) and by the backfill script, so the exact same text-shaping logic
 * produces every embedding — a different shape between the two would mean
 * "similar" embeddings aren't actually comparable.
 */
export function buildRecipeEmbeddingText({
  title,
  ingredients,
  instructions,
}: {
  title: string;
  ingredients: string[];
  instructions: string;
}): string {
  return `${title}\n\nIngredients: ${ingredients.join(", ")}\n\nInstructions: ${instructions}`;
}
