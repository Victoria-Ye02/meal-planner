"use client";

import { useState, type FormEvent } from "react";

import { IngredientInput } from "@/components/IngredientInput";
import { RecipeCard } from "@/components/RecipeCard";
import type { Recipe } from "@/lib/ai/generateRecipes";

const DIETARY_PREFERENCE_OPTIONS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "keto",
  "low-carb",
] as const;

type GenerateFormData = {
  ingredients: string[];
  dietaryPreferences: string[];
};

/**
 * Narrow, structural runtime checks for the `{ recipes: Recipe[] }` success
 * body returned by POST /api/recipes/generate. The route already validates
 * this shape server-side (Task 6); this is defense-in-depth on the client
 * so a malformed/unexpected body degrades to an error state instead of
 * crashing the render.
 */
function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === "string" &&
    Array.isArray(candidate.ingredients) &&
    candidate.ingredients.every((entry) => typeof entry === "string") &&
    typeof candidate.instructions === "string"
  );
}

function isRecipesResponse(value: unknown): value is { recipes: Recipe[] } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.recipes) && candidate.recipes.every(isRecipe);
}

/**
 * Collects ingredients and dietary preferences, submits them to
 * POST /api/recipes/generate, and renders the result: a loading indicator
 * while the request is in flight, a retryable error state if it fails, or
 * a grid of RecipeCards on success.
 */
export function GenerateForm() {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);

  function handleAddIngredient(ingredient: string) {
    setIngredients((current) => [...current, ingredient]);
    setValidationError(null);
  }

  function handleRemoveIngredient(ingredient: string) {
    setIngredients((current) =>
      current.filter((existing) => existing !== ingredient),
    );
  }

  function toggleDietaryPreference(preference: string) {
    setDietaryPreferences((current) =>
      current.includes(preference)
        ? current.filter((existing) => existing !== preference)
        : [...current, preference],
    );
  }

  async function submitGeneration() {
    setRequestError(null);
    setIsSubmitting(true);

    const formData: GenerateFormData = { ingredients, dietaryPreferences };

    try {
      const response = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const body: unknown = await response.json();

      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Failed to generate recipes. Please try again.";
        setRequestError(message);
        return;
      }

      if (!isRecipesResponse(body)) {
        setRequestError(
          "Received an unexpected response from the server. Please try again.",
        );
        return;
      }

      setRecipes(body.recipes);
    } catch {
      setRequestError("Failed to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ingredients.length === 0) {
      setValidationError("Add at least one ingredient to generate recipes.");
      return;
    }

    setValidationError(null);
    setRecipes(null);
    await submitGeneration();
  }

  function handleRetry() {
    void submitGeneration();
  }

  const canSubmit = ingredients.length > 0;

  return (
    <div className="flex w-full flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-lg flex-col gap-6"
      >
        <IngredientInput
          ingredients={ingredients}
          onAdd={handleAddIngredient}
          onRemove={handleRemoveIngredient}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Dietary preferences (optional)
          </legend>
          <div className="flex flex-wrap gap-2">
            {DIETARY_PREFERENCE_OPTIONS.map((preference) => {
              const isSelected = dietaryPreferences.includes(preference);
              return (
                <button
                  key={preference}
                  type="button"
                  onClick={() => toggleDietaryPreference(preference)}
                  aria-pressed={isSelected}
                  className={`rounded-full border px-3 py-1 text-sm font-medium ${
                    isSelected
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
                  }`}
                >
                  {preference}
                </button>
              );
            })}
          </div>
        </fieldset>

        {validationError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {validationError}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit || isSubmitting}
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {isSubmitting ? "Generating…" : "Generate recipes"}
        </button>
      </form>

      {isSubmitting && (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
        >
          <svg
            className="h-5 w-5 animate-spin text-zinc-500 dark:text-zinc-400"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Generating recipes, this can take a few seconds…</span>
        </div>
      )}

      {requestError && !isSubmitting && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
        >
          <p>{requestError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-700 dark:border-red-800 dark:text-red-400"
          >
            Try again
          </button>
        </div>
      )}

      {recipes && recipes.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe, index) => (
            <RecipeCard key={`${index}-${recipe.title}`} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
