import { prisma } from "@/lib/db";

/**
 * Looks up a `MealPlan` by id and confirms it belongs to `userId`, in one
 * query. Returns `null` both when the plan doesn't exist and when it
 * exists but belongs to someone else — callers should treat both cases
 * identically (404, never leaking whether the id belongs to another user)
 * per the ownership-check requirement in task-10-brief.md. Shared by every
 * route under app/api/mealplan/[planId]/ that needs to verify the
 * requesting user actually owns the plan before reading or writing it.
 */
export async function findOwnedMealPlan(planId: string, userId: string) {
  return prisma.mealPlan.findFirst({
    where: { id: planId, userId },
  });
}

/**
 * Canonicalizes a `weekStartDate` to UTC midnight of its calendar date,
 * dropping the time-of-day component entirely. Both `POST /api/mealplan`
 * (write) and `GET /api/mealplan?weekStartDate=` (exact-match lookup) run
 * every date through this before touching the database, so two requests
 * that mean "the same week" — even if one arrived as `new Date(dateString)`
 * (UTC midnight, e.g. from a raw `"2026-07-26"` string) and the other as
 * `new Date(year, month, day)` (local midnight, e.g. from `<input
 * type="date">` parsing) — collapse to the same stored `DateTime` instead
 * of silently missing each other on `findFirst`'s exact equality check.
 */
export function normalizeWeekStartDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
