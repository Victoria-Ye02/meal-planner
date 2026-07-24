"use client";

import { useId, useState, type KeyboardEvent } from "react";

type IngredientInputProps = {
  ingredients: string[];
  onAdd: (ingredient: string) => void;
  onRemove: (ingredient: string) => void;
  label?: string;
  placeholder?: string;
};

/**
 * Tag-style input: type an ingredient and press Enter (or click "Add") to
 * add it as a removable chip. The list of tags and the add/remove
 * operations are fully controlled by the parent — this component only
 * manages the pending text field.
 */
export function IngredientInput({
  ingredients,
  onAdd,
  onRemove,
  label = "Ingredients",
  placeholder = "e.g. chicken breast",
}: IngredientInputProps) {
  const [pendingValue, setPendingValue] = useState("");
  const inputId = useId();

  function commitPendingValue() {
    const trimmed = pendingValue.trim();
    if (trimmed.length === 0) {
      return;
    }
    const alreadyAdded = ingredients.some(
      (ingredient) => ingredient.toLowerCase() === trimmed.toLowerCase(),
    );
    if (!alreadyAdded) {
      onAdd(trimmed);
    }
    setPendingValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitPendingValue();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="text"
          value={pendingValue}
          onChange={(event) => setPendingValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="button"
          onClick={commitPendingValue}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        >
          Add
        </button>
      </div>
      {ingredients.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {ingredients.map((ingredient) => (
            <li
              key={ingredient}
              className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
            >
              <span>{ingredient}</span>
              <button
                type="button"
                onClick={() => onRemove(ingredient)}
                aria-label={`Remove ${ingredient}`}
                className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
