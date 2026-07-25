import type { ToolDefinition } from "@/lib/ai/chatAssistant";

export const ASSIGN_RECIPE_TOOL_NAME = "assign_recipe_to_meal_plan";

/**
 * OpenAI-compatible tool definition offered to the model in
 * app/api/assistant/route.ts. Deliberately has NO planId/userId parameter
 * — the model can only ever specify which recipe/day/meal, never which
 * plan or user; the route resolves "the current week's plan for the
 * authenticated user" itself, so a manipulated or hallucinated argument
 * from the model can't target another user's data.
 *
 * The system prompt (lib/ai/assistantPrompt.ts) is what actually gates
 * *when* this tool gets called — it instructs the model to only call it
 * after the user has explicitly confirmed a suggested assignment, never
 * on a first ask. This schema only describes what the call looks like;
 * confirmation gating is a prompting concern, not a schema concern.
 */
export const ASSIGN_RECIPE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: ASSIGN_RECIPE_TOOL_NAME,
    description:
      "Assigns one of the user's saved recipes to a specific day and meal type in their current week's meal plan. Only call this after the user has explicitly confirmed they want the assignment made — never on a first suggestion.",
    parameters: {
      type: "object",
      properties: {
        recipeId: {
          type: "string",
          description:
            "The id of one of the user's saved recipes, from the saved-recipe data provided earlier in this conversation. Never invent an id.",
        },
        dayOfWeek: {
          type: "integer",
          description: "0 = Sunday, 1 = Monday, ..., 6 = Saturday.",
          minimum: 0,
          maximum: 6,
        },
        mealType: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner"],
        },
      },
      required: ["recipeId", "dayOfWeek", "mealType"],
    },
  },
};
