import { z } from "zod";

import { MealType } from "@/app/generated/prisma/enums";

/**
 * `dayOfWeek` convention used consistently across every meal-plan API
 * response and request body: 0 = Sunday, 1 = Monday, ..., 6 = Saturday —
 * i.e. it matches JavaScript's `Date.prototype.getDay()`. Nothing else in
 * the codebase established a convention before this task, so this is the
 * one to follow going forward (Task 11's calendar UI included).
 */
export const DAY_OF_WEEK_MIN = 0;
export const DAY_OF_WEEK_MAX = 6;

const dayOfWeekSchema = z
  .number()
  .int("dayOfWeek must be an integer.")
  .min(
    DAY_OF_WEEK_MIN,
    "dayOfWeek must be between 0 (Sunday) and 6 (Saturday).",
  )
  .max(
    DAY_OF_WEEK_MAX,
    "dayOfWeek must be between 0 (Sunday) and 6 (Saturday).",
  );

const mealTypeSchema = z.enum(MealType);

/**
 * Request body shape for POST /api/mealplan. `weekStartDate` is accepted as
 * an ISO date/datetime string and coerced to a `Date` — callers are
 * expected to pass the Sunday (or whatever day they treat as the start of
 * the week) that anchors the plan; this route does not itself normalize or
 * validate that the date falls on a particular weekday.
 */
export const createMealPlanRequestSchema = z.object({
  weekStartDate: z.coerce.date({
    error: "weekStartDate must be a valid date.",
  }),
});

export type CreateMealPlanRequest = z.infer<typeof createMealPlanRequestSchema>;

/**
 * Query-param shape for GET /api/mealplan?weekStartDate=... — same
 * `z.coerce.date()` coercion as the POST body schema so a query-string
 * lookup accepts the same range of date formats a write does, instead of
 * bypassing Zod with a raw `new Date()` + `Number.isNaN` check.
 */
export const weekStartDateQuerySchema = z.object({
  weekStartDate: z.coerce.date({
    error: "weekStartDate must be a valid date.",
  }),
});

export type WeekStartDateQuery = z.infer<typeof weekStartDateQuerySchema>;

/**
 * Request body shape for PUT /api/mealplan/[planId]/entries — assigns
 * (or replaces) the recipe in a single `(dayOfWeek, mealType)` slot.
 */
export const upsertMealPlanEntryRequestSchema = z.object({
  recipeId: z.string().trim().min(1, "recipeId is required."),
  dayOfWeek: dayOfWeekSchema,
  mealType: mealTypeSchema,
});

export type UpsertMealPlanEntryRequest = z.infer<
  typeof upsertMealPlanEntryRequestSchema
>;

/**
 * Request body shape for DELETE /api/mealplan/[planId]/entries — clears
 * whatever recipe currently occupies a `(dayOfWeek, mealType)` slot.
 */
export const removeMealPlanEntryRequestSchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  mealType: mealTypeSchema,
});

export type RemoveMealPlanEntryRequest = z.infer<
  typeof removeMealPlanEntryRequestSchema
>;
