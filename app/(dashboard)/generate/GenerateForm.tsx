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
 * Collects ingredients and dietary preferences for AI recipe generation.
 * There is no generation endpoint yet (that lands in Task 6), so submit is
 * a placeholder that just logs the collected data.
 */
export function GenerateForm() {
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<GenerateFormData | null>(
    null,
  );

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (ingredients.length === 0) {
      setValidationError("Add at least one ingredient to generate recipes.");
      return;
    }

    setValidationError(null);

    const formData: GenerateFormData = { ingredients, dietaryPreferences };
    // Placeholder submit — the real generation API lands in Task 6.
    console.log("Generate recipe request", formData);
    setLastSubmitted(formData);
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
        disabled={!canSubmit}
        className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        Generate recipes
      </button>

      {lastSubmitted && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Request captured — recipe generation is coming in a future task.
        </p>
      )}
    </form>
  );
}
