"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { MealType } from "@/app/generated/prisma/enums";
import { buildShoppingList } from "@/lib/shoppingList";

/** Recipe the user can pick from when assigning a slot — always a saved recipe. */
export type SavedRecipeOption = {
  id: string;
  title: string;
  ingredients: string[];
};

/** One filled `(dayOfWeek, mealType)` slot, with the recipe title/ingredients already joined in. */
export type MealPlanEntryData = {
  id: string;
  dayOfWeek: number;
  mealType: MealType;
  recipeId: string;
  recipeTitle: string;
  recipeIngredients: string[];
};

/** A single day of the 7-day grid: its `dayOfWeek` offset plus display labels. */
export type MealPlanDay = {
  dayOfWeek: number;
  label: string;
  dateLabel: string;
};

type MealPlanCalendarProps = {
  planId: string;
  days: MealPlanDay[];
  initialEntries: MealPlanEntryData[];
  savedRecipes: SavedRecipeOption[];
};

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

function slotKey(dayOfWeek: number, mealType: MealType): string {
  return `${dayOfWeek}-${mealType}`;
}

/** Narrow runtime check for the `MealPlanEntry` shape PUT .../entries returns. */
function isEntryIdResponse(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

type SlotUiState = {
  /** Recipe currently chosen in this slot's picker, before "Assign" is clicked. */
  selectedRecipeId: string;
  isSubmitting: boolean;
  error: string | null;
};

const DEFAULT_SLOT_STATE: SlotUiState = {
  selectedRecipeId: "",
  isSubmitting: false,
  error: null,
};

/**
 * Renders the current week as a 7-day x 3-meal-type grid and lets the user
 * assign/remove a saved recipe per slot. Follows the non-optimistic,
 * wait-for-response pattern established in FavoritesList/GenerateForm: the
 * grid only changes once the server confirms success, and a failed
 * assign/remove leaves the grid exactly as it was, surfacing an inline
 * error on just that slot instead.
 */
export function MealPlanCalendar({
  planId,
  days,
  initialEntries,
  savedRecipes,
}: MealPlanCalendarProps) {
  const [entries, setEntries] = useState<MealPlanEntryData[]>(initialEntries);
  const [slotStates, setSlotStates] = useState<Record<string, SlotUiState>>({});
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const shoppingList = useMemo(
    () =>
      buildShoppingList(
        entries.map((entry) => ({ ingredients: entry.recipeIngredients })),
      ),
    [entries],
  );

  function toggleChecked(itemId: string) {
    setCheckedItems((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function getSlotState(key: string): SlotUiState {
    return slotStates[key] ?? DEFAULT_SLOT_STATE;
  }

  function patchSlotState(key: string, patch: Partial<SlotUiState>) {
    setSlotStates((current) => ({
      ...current,
      [key]: { ...(current[key] ?? DEFAULT_SLOT_STATE), ...patch },
    }));
  }

  function findEntry(
    dayOfWeek: number,
    mealType: MealType,
  ): MealPlanEntryData | undefined {
    return entries.find(
      (entry) => entry.dayOfWeek === dayOfWeek && entry.mealType === mealType,
    );
  }

  async function handleAssign(dayOfWeek: number, mealType: MealType) {
    const key = slotKey(dayOfWeek, mealType);
    const recipeId = getSlotState(key).selectedRecipeId;
    if (!recipeId) {
      return;
    }
    const recipe = savedRecipes.find((candidate) => candidate.id === recipeId);
    if (!recipe) {
      return;
    }

    patchSlotState(key, { isSubmitting: true, error: null });

    try {
      const response = await fetch(`/api/mealplan/${planId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, dayOfWeek, mealType }),
      });

      if (!response.ok) {
        throw new Error("Failed to assign recipe. Please try again.");
      }

      const body: unknown = await response.json();
      const entryId = isEntryIdResponse(body) ? body.id : key;

      setEntries((current) => [
        ...current.filter(
          (entry) =>
            !(entry.dayOfWeek === dayOfWeek && entry.mealType === mealType),
        ),
        {
          id: entryId,
          dayOfWeek,
          mealType,
          recipeId,
          recipeTitle: recipe.title,
          recipeIngredients: recipe.ingredients,
        },
      ]);
      patchSlotState(key, {
        isSubmitting: false,
        error: null,
        selectedRecipeId: "",
      });
    } catch (err) {
      patchSlotState(key, {
        isSubmitting: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to reach the server. Please try again.",
      });
    }
  }

  async function handleRemove(dayOfWeek: number, mealType: MealType) {
    const key = slotKey(dayOfWeek, mealType);
    patchSlotState(key, { isSubmitting: true, error: null });

    try {
      const response = await fetch(`/api/mealplan/${planId}/entries`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOfWeek, mealType }),
      });

      if (!response.ok) {
        throw new Error("Failed to remove recipe. Please try again.");
      }

      setEntries((current) =>
        current.filter(
          (entry) =>
            !(entry.dayOfWeek === dayOfWeek && entry.mealType === mealType),
        ),
      );
      patchSlotState(key, { isSubmitting: false, error: null });
    } catch (err) {
      patchSlotState(key, {
        isSubmitting: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to reach the server. Please try again.",
      });
    }
  }

  const hasSavedRecipes = savedRecipes.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowShoppingList((current) => !current)}
          disabled={entries.length === 0}
          className="inline-flex items-center justify-center rounded-control border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showShoppingList ? "Hide shopping list" : "Generate shopping list"}
        </button>
        {entries.length === 0 && (
          <span className="text-xs text-muted">
            Assign a recipe to a slot first.
          </span>
        )}
      </div>

      {showShoppingList && (
        <div className="rounded-card border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Shopping list
          </h2>
          <p className="mt-1 text-xs text-muted">
            Combined ingredients from every recipe assigned this week.
          </p>
          {shoppingList.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing to shop for yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {shoppingList.map((item) => {
                const isChecked = checkedItems.has(item.id);
                return (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 transition-colors duration-200 ease-out-quart hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleChecked(item.id)}
                        className="h-4 w-4 shrink-0 accent-primary"
                      />
                      <span
                        className={
                          isChecked
                            ? "text-sm text-muted line-through"
                            : "text-sm text-foreground"
                        }
                      >
                        {item.detail ? `${item.detail} ` : ""}
                        {item.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {!hasSavedRecipes && (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface p-8 text-center">
          <span className="text-2xl" aria-hidden="true">
            📋
          </span>
          <p className="font-display text-base font-semibold text-foreground">
            No saved recipes to plan with yet
          </p>
          <p className="max-w-sm text-sm text-muted">
            <Link
              href="/generate"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
            >
              Generate a recipe
            </Link>{" "}
            or check your{" "}
            <Link
              href="/favorites"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
            >
              favorites
            </Link>
            , then save one to assign it to a slot below.
          </p>
        </div>
      )}

      <p className="text-xs text-muted sm:hidden" aria-hidden="true">
        Scroll right to see Lunch &amp; Dinner →
      </p>

      <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 border-b border-border bg-surface-2 p-3 text-left font-medium text-muted">
                Day
              </th>
              {MEAL_TYPES.map((mealType) => (
                <th
                  key={mealType.value}
                  className="border-b border-border bg-surface-2 p-3 text-left font-medium text-muted"
                >
                  {mealType.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.dayOfWeek}>
                <td className="border-b border-border p-3 align-top">
                  <div className="font-medium text-foreground">{day.label}</div>
                  <div className="text-xs text-muted">{day.dateLabel}</div>
                </td>
                {MEAL_TYPES.map((mealType) => {
                  const key = slotKey(day.dayOfWeek, mealType.value);
                  const entry = findEntry(day.dayOfWeek, mealType.value);
                  const state = getSlotState(key);

                  return (
                    <td
                      key={key}
                      className="border-b border-border p-3 align-top transition-colors duration-200 ease-out-quart hover:bg-surface-2/50"
                    >
                      {entry ? (
                        <div className="flex flex-col items-start gap-1.5">
                          <span className="text-foreground">
                            {entry.recipeTitle}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemove(day.dayOfWeek, mealType.value)
                            }
                            disabled={state.isSubmitting}
                            className="rounded-control border border-border px-2 py-0.5 text-xs font-medium text-foreground transition-colors duration-200 ease-out-quart hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {state.isSubmitting ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      ) : hasSavedRecipes ? (
                        <div className="flex flex-col items-start gap-1.5">
                          <select
                            value={state.selectedRecipeId}
                            onChange={(event) =>
                              patchSlotState(key, {
                                selectedRecipeId: event.target.value,
                              })
                            }
                            disabled={state.isSubmitting}
                            className="w-full max-w-[10rem] rounded-control border border-border bg-background p-1 text-xs text-foreground transition-colors duration-200 ease-out-quart focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">Pick a recipe…</option>
                            {savedRecipes.map((recipe) => (
                              <option key={recipe.id} value={recipe.id}>
                                {recipe.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              handleAssign(day.dayOfWeek, mealType.value)
                            }
                            disabled={
                              state.isSubmitting || !state.selectedRecipeId
                            }
                            className="rounded-control bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground transition-colors duration-200 ease-out-quart hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {state.isSubmitting ? "Assigning…" : "Assign"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}

                      {state.error && (
                        <p role="alert" className="mt-1 text-xs text-danger">
                          {state.error}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
