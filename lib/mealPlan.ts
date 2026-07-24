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
