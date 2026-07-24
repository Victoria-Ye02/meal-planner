import { Prisma } from "@/app/generated/prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeWeekStartDate } from "@/lib/mealPlan";
import {
  createMealPlanRequestSchema,
  weekStartDateQuerySchema,
} from "@/lib/validations/mealPlan";

const PRISMA_UNIQUE_CONSTRAINT_ERROR = "P2002";

/**
 * POST /api/mealplan
 *
 * Creates a new `MealPlan` for the current user anchored at `weekStartDate`.
 * Users can have any number of plans for different weeks, but `(userId,
 * weekStartDate)` is enforced unique at the database level (see the
 * `MealPlan` model's `@@unique([userId, weekStartDate])`), so calling this
 * twice for the same week returns a clean 409 rather than creating a
 * duplicate plan; it's still the client's job to check
 * GET /api/mealplan?weekStartDate= first if it wants to avoid hitting that
 * conflict in the first place.
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

  try {
    const plan = await prisma.mealPlan.create({
      data: {
        userId,
        weekStartDate: normalizeWeekStartDate(parsed.data.weekStartDate),
      },
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
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
    ) {
      return NextResponse.json(
        { error: "A meal plan for this week already exists." },
        { status: 409 },
      );
    }
    throw error;
  }
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
    const parsedQuery = weekStartDateQuerySchema.safeParse({
      weekStartDate: weekStartDateParam,
    });
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid weekStartDate query parameter." },
        { status: 400 },
      );
    }

    const weekStartDate = normalizeWeekStartDate(parsedQuery.data.weekStartDate);

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
