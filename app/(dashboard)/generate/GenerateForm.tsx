"use client";

import { useState, type FormEvent } from "react";

import { IngredientInput } from "@/components/IngredientInput";

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
 * Collects ingredients and dietary preferences for AI recipe generation and
 * submits them to POST /api/recipes/generate. Rendering here is
 * deliberately minimal (raw JSON dump) — real result cards, loading, and
 * error UI land in Task 7.
 */
export function GenerateForm() {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ingredients.length === 0) {
      setValidationError("Add at least one ingredient to generate recipes.");
      return;
    }

    setValidationError(null);
    setRequestError(null);
    setResult(null);

    const formData: GenerateFormData = { ingredients, dietaryPreferences };
    setIsSubmitting(true);

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

      setResult(body);
    } catch {
      setRequestError("Failed to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = ingredients.length > 0;

  return (
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

      {requestError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {requestError}
        </p>
      )}

      {/* Minimal raw-JSON rendering to prove the endpoint wiring works
          end-to-end. Task 7 replaces this with RecipeCard/loading/error UI. */}
      {result !== null && (
        <pre className="max-h-96 overflow-auto rounded-md bg-zinc-100 p-3 text-xs text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </form>
  );
}
