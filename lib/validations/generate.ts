import { z } from "zod";

/**
 * Request body shape for POST /api/recipes/generate. Field names mirror
 * what the client form (GenerateForm) collects and sends: `ingredients`
 * and `dietaryPreferences`. Mapped to the AI wrapper's `{ingredients,
 * preferences}` shape inside the route handler, not here.
 */
export const generateRecipesRequestSchema = z.object({
  ingredients: z
    .array(z.string().trim().min(1, "Ingredients cannot be empty strings."))
    .min(1, "Add at least one ingredient to generate recipes."),
  dietaryPreferences: z
    .array(z.string().trim().min(1, "Preferences cannot be empty strings."))
    .default([]),
});

export type GenerateRecipesRequest = z.infer<
  typeof generateRecipesRequestSchema
>;
