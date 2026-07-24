import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { findOwnedMealPlan } from "@/lib/mealPlan";
import { prisma } from "@/lib/db";

/**
 * GET /api/mealplan/[planId]
 *
 * Fetches a single meal plan and its entries, for rendering a calendar
 * week (Task 11). Ownership-checked: a plan that exists but belongs to a
 * different user 404s exactly like a plan that doesn't exist at all, so
 * this never confirms/denies another user's plan id.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { planId } = await params;
  if (!planId) {
    return NextResponse.json({ error: "Missing planId." }, { status: 400 });
  }

  const plan = await findOwnedMealPlan(planId, userId);
  if (!plan) {
    return NextResponse.json(
      { error: "Meal plan not found." },
      { status: 404 },
    );
  }

  const entries = await prisma.mealPlanEntry.findMany({
    where: { mealPlanId: planId },
    include: { recipe: true },
  });

  return NextResponse.json({ ...plan, entries }, { status: 200 });
}
