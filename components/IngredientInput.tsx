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
      <label htmlFor={inputId} className="text-sm font-medium text-foreground">
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
          className="flex-1 rounded-control border border-border bg-surface px-3 py-2.5 text-foreground transition-colors duration-200 ease-out-quart focus:border-primary"
        />
        <button
          type="button"
          onClick={commitPendingValue}
          className="rounded-control border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors duration-200 ease-out-quart hover:bg-surface-2"
        >
          Add
        </button>
      </div>
      {ingredients.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {ingredients.map((ingredient) => (
            <li
              key={ingredient}
              className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-3 pr-2 text-sm text-foreground"
            >
              <span>{ingredient}</span>
              <button
                type="button"
                onClick={() => onRemove(ingredient)}
                aria-label={`Remove ${ingredient}`}
                className="rounded-full p-0.5 text-muted transition-colors duration-200 ease-out-quart hover:bg-border hover:text-foreground"
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
