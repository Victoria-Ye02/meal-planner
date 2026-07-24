"use client";

import Link from "next/link";
import { useState } from "react";

import type { MealType } from "@/app/generated/prisma/enums";

/** Recipe the user can pick from when assigning a slot — always a saved recipe. */
export type SavedRecipeOption = {
  id: string;
  title: string;
};

/** One filled `(dayOfWeek, mealType)` slot, with the recipe title already joined in. */
export type MealPlanEntryData = {
  id: string;
  dayOfWeek: number;
  mealType: MealType;
  recipeId: string;
  recipeTitle: string;
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
  const [slotStates, setSlotStates] = useState<Record<string, SlotUiState>>(
    {},
  );

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
      {!hasSavedRecipes && (
        <div className="rounded-md border border-dashed border-zinc-300 p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          You haven&apos;t saved any recipes yet, so there&apos;s nothing to
          assign to a slot.{" "}
          <Link
            href="/generate"
            className="font-medium text-zinc-900 underline dark:text-zinc-50"
          >
            Generate a recipe
          </Link>{" "}
          or check your{" "}
          <Link
            href="/favorites"
            className="font-medium text-zinc-900 underline dark:text-zinc-50"
          >
            favorites
          </Link>
          , then save one to get started.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 border-b border-zinc-200 p-2 text-left font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                Day
              </th>
              {MEAL_TYPES.map((mealType) => (
                <th
                  key={mealType.value}
                  className="border-b border-zinc-200 p-2 text-left font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
                >
                  {mealType.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.dayOfWeek}>
                <td className="border-b border-zinc-100 p-2 align-top dark:border-zinc-900">
                  <div className="font-medium text-zinc-900 dark:text-zinc-50">
                    {day.label}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-500">
                    {day.dateLabel}
                  </div>
                </td>
                {MEAL_TYPES.map((mealType) => {
                  const key = slotKey(day.dayOfWeek, mealType.value);
                  const entry = findEntry(day.dayOfWeek, mealType.value);
                  const state = getSlotState(key);

                  return (
                    <td
                      key={key}
                      className="border-b border-zinc-100 p-2 align-top dark:border-zinc-900"
                    >
                      {entry ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-zinc-900 dark:text-zinc-50">
                            {entry.recipeTitle}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemove(day.dayOfWeek, mealType.value)
                            }
                            disabled={state.isSubmitting}
                            className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
                          >
                            {state.isSubmitting ? "Removing…" : "Remove"}
                          </button>
                        </div>
                      ) : hasSavedRecipes ? (
                        <div className="flex flex-col items-start gap-1">
                          <select
                            value={state.selectedRecipeId}
                            onChange={(event) =>
                              patchSlotState(key, {
                                selectedRecipeId: event.target.value,
                              })
                            }
                            disabled={state.isSubmitting}
                            className="w-full max-w-[10rem] rounded-md border border-zinc-300 bg-transparent p-1 text-xs text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50"
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
                            className="rounded-md bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                          >
                            {state.isSubmitting ? "Assigning…" : "Assign"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-600">
                          —
                        </span>
                      )}

                      {state.error && (
                        <p
                          role="alert"
                          className="mt-1 text-xs text-red-600 dark:text-red-400"
                        >
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
