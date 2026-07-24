import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createMealPlanRequestSchema } from "@/lib/validations/mealPlan";

/**
 * POST /api/mealplan
 *
 * Creates a new `MealPlan` for the current user anchored at `weekStartDate`.
 * Users can have any number of plans for different weeks — `weekStartDate`
 * is not unique, so this never collides with (or overwrites) an existing
 * week's plan; it's the client's job to check GET /api/mealplan?weekStartDate=
 * first if it wants to avoid creating duplicate plans for the same week.
 *
 * Returns the created plan with an empty `entries` array (mirroring the
 * shape GET /api/mealplan/[planId] returns) so the client can immediately
 * start assigning recipes to slots without a second fetch.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createMealPlanRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const plan = await prisma.mealPlan.create({
    data: { userId, weekStartDate: parsed.data.weekStartDate },
  });

  return NextResponse.json(
    {
      id: plan.id,
      userId: plan.userId,
      weekStartDate: plan.weekStartDate,
      entries: [],
    },
    { status: 201 },
  );
}

/**
 * GET /api/mealplan
 * GET /api/mealplan?weekStartDate=2026-07-26
 *
 * Without a `weekStartDate` query param: lists all of the current user's
 * meal plans (id + weekStartDate only, no entries — a lightweight index
 * for a plan picker), newest week first.
 *
 * With `weekStartDate`: returns the single matching plan (scoped to the
 * current user) with its entries included, or 404 if the user has no plan
 * for that exact week yet. This is the "does a plan already exist for the
 * week I'm looking at" lookup Task 11's calendar UI needs.
 */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekStartDateParam = searchParams.get("weekStartDate");

  if (weekStartDateParam !== null) {
    const weekStartDate = new Date(weekStartDateParam);
    if (Number.isNaN(weekStartDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid weekStartDate query parameter." },
        { status: 400 },
      );
    }

    const plan = await prisma.mealPlan.findFirst({
      where: { userId, weekStartDate },
      include: { entries: true },
    });

    if (!plan) {
      return NextResponse.json(
        { error: "No meal plan found for that week." },
        { status: 404 },
      );
    }

    return NextResponse.json(plan, { status: 200 });
  }

  const plans = await prisma.mealPlan.findMany({
    where: { userId },
    select: { id: true, weekStartDate: true },
    orderBy: { weekStartDate: "desc" },
  });

  return NextResponse.json({ plans }, { status: 200 });
}
