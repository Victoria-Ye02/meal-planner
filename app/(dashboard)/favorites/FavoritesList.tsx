"use client";

import Link from "next/link";
import { useState } from "react";

import { RecipeCard } from "@/components/RecipeCard";

export type FavoriteRecipe = {
  id: string;
  title: string;
  ingredients: string[];
  instructions: string;
};

type FavoritesListProps = {
  /** Server-fetched saved recipes for the current user, newest-saved first. */
  initialFavorites: FavoriteRecipe[];
};

/** Per-card unsave state, keyed by `Recipe.id`. */
type UnsaveState = {
  isRemoving: boolean;
  error: string | null;
};

const DEFAULT_UNSAVE_STATE: UnsaveState = { isRemoving: false, error: null };

/**
 * Renders the current user's saved recipes and lets them unsave any of
 * them. Every card here is, by definition, already saved (`saved` is
 * always `true`) — clicking the toggle button calls
 * DELETE /api/recipes/save/[recipeId] and only removes the card from the
 * list once the server confirms success, following the same
 * non-optimistic-with-rollback pattern as GenerateForm's save toggle: on
 * failure the card stays put and shows an inline error instead of silently
 * looking unsaved.
 */
export function FavoritesList({ initialFavorites }: FavoritesListProps) {
  const [favorites, setFavorites] =
    useState<FavoriteRecipe[]>(initialFavorites);
  const [unsaveStates, setUnsaveStates] = useState<Record<string, UnsaveState>>(
    {},
  );

  async function handleUnsave(recipeId: string) {
    setUnsaveStates((current) => ({
      ...current,
      [recipeId]: { isRemoving: true, error: null },
    }));

    try {
      const response = await fetch(`/api/recipes/save/${recipeId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to unsave recipe. Please try again.");
      }

      setFavorites((current) =>
        current.filter((recipe) => recipe.id !== recipeId),
      );
      setUnsaveStates((current) => {
        const next = { ...current };
        delete next[recipeId];
        return next;
      });
    } catch (err) {
      setUnsaveStates((current) => ({
        ...current,
        [recipeId]: {
          isRemoving: false,
          error:
            err instanceof Error
              ? err.message
              : "Failed to reach the server. Please try again.",
        },
      }));
    }
  }

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface p-12 text-center">
        <span className="text-3xl" aria-hidden="true">
          🤍
        </span>
        <p className="font-display text-lg font-semibold text-foreground">
          You haven&apos;t saved any recipes yet.
        </p>
        <p className="max-w-sm text-sm text-muted">
          Generate a recipe and tap &quot;Save&quot; to add it to your
          favorites.
        </p>
        <Link
          href="/generate"
          className="mt-2 inline-flex items-center justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-primary-hover"
        >
          Generate a recipe
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {favorites.map((recipe) => {
        const state = unsaveStates[recipe.id] ?? DEFAULT_UNSAVE_STATE;
        return (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            saved
            isSaving={state.isRemoving}
            saveError={state.error}
            onToggleSave={() => handleUnsave(recipe.id)}
          />
        );
      })}
    </div>
  );
}
