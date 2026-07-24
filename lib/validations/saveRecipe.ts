import { z } from "zod";

/**
 * Request body shape for POST /api/recipes/save. The client sends the full
 * AI-generated recipe payload (it has no id yet — AI recipes aren't
 * persisted until saved), and the route find-or-creates a `Recipe` row for
 * it. Field names mirror `Recipe` from lib/ai/generateRecipes.ts.
 */
export const saveRecipeRequestSchema = z.object({
  title: z.string().trim().min(1, "Recipe title must not be empty."),
  ingredients: z
    .array(z.string().trim().min(1, "Ingredients cannot be empty strings."))
    .min(1, "Recipe must list at least one ingredient."),
  instructions: z
    .string()
    .trim()
    .min(1, "Recipe instructions must not be empty."),
});

export type SaveRecipeRequest = z.infer<typeof saveRecipeRequestSchema>;
