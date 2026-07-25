import type { MealType } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getCurrentWeekStartDate } from "@/lib/mealPlan";
import { DAY_LABELS } from "@/lib/validations/mealPlan";

export type AssignRecipeToMealPlanResult =
  | { success: true; recipeTitle: string; dayLabel: string; mealType: MealType }
  | { success: false; error: string };

/**
 * The write side of the cooking assistant's `assign_recipe_to_meal_plan`
 * tool (app/api/assistant/route.ts). Called only after the route has
 * already validated the tool call's raw arguments and confirmed the
 * request is for the authenticated user's own data — this function adds
 * the actual ownership check against the database (never trust that the
 * model's arguments are honest) and performs the write.
 *
 * Ownership check mirrors app/api/mealplan/[planId]/entries/route.ts's PUT
 * handler exactly: a recipe is assignable only if the requesting user
 * created it or has it saved — never any valid recipe id in the system.
 *
 * The plan is resolved via `upsert` against the current week (never a
 * plain `create`), matching the get-or-create pattern already established
 * in app/(dashboard)/mealplan/page.tsx and app/(dashboard)/generate/page.tsx,
 * so this can't race a duplicate MealPlan row into existence.
 */
export async function assignRecipeToMealPlan({
  userId,
  recipeId,
  dayOfWeek,
  mealType,
}: {
  userId: string;
  recipeId: string;
  dayOfWeek: number;
  mealType: MealType;
}): Promise<AssignRecipeToMealPlanResult> {
  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      OR: [{ createdBy: userId }, { savedBy: { some: { userId } } }],
    },
  });

  if (!recipe) {
    return {
      success: false,
      error:
        "That recipe isn't one of your saved recipes, so it can't be assigned.",
    };
  }

  const weekStartDate = getCurrentWeekStartDate(new Date());
  const plan = await prisma.mealPlan.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate } },
    update: {},
    create: { userId, weekStartDate },
  });

  await prisma.mealPlanEntry.upsert({
    where: {
      mealPlanId_dayOfWeek_mealType: {
        mealPlanId: plan.id,
        dayOfWeek,
        mealType,
      },
    },
    update: { recipeId },
    create: { mealPlanId: plan.id, dayOfWeek, mealType, recipeId },
  });

  return {
    success: true,
    recipeTitle: recipe.title,
    dayLabel: DAY_LABELS[dayOfWeek] ?? `day ${dayOfWeek}`,
    mealType,
  };
}
