import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findOwnedMealPlan } from "@/lib/mealPlan";
import {
  removeMealPlanEntryRequestSchema,
  upsertMealPlanEntryRequestSchema,
} from "@/lib/validations/mealPlan";

/**
 * PUT /api/mealplan/[planId]/entries
 *
 * Assigns `recipeId` to the `(dayOfWeek, mealType)` slot on this plan,
 * ownership-checked so a user can never write into another user's plan.
 * Uses `upsert` against the `mealPlanId_dayOfWeek_mealType` compound
 * unique key (schema.prisma's `@@unique([mealPlanId, dayOfWeek,
 * mealType])`) so re-assigning an already-filled slot replaces its recipe
 * in place instead of throwing a unique-constraint error.
 */
export async function PUT(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = upsertMealPlanEntryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const plan = await findOwnedMealPlan(planId, userId);
  if (!plan) {
    return NextResponse.json(
      { error: "Meal plan not found." },
      { status: 404 },
    );
  }

  const { recipeId, dayOfWeek, mealType } = parsed.data;

  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
  }

  const entry = await prisma.mealPlanEntry.upsert({
    where: {
      mealPlanId_dayOfWeek_mealType: {
        mealPlanId: planId,
        dayOfWeek,
        mealType,
      },
    },
    create: { mealPlanId: planId, recipeId, dayOfWeek, mealType },
    update: { recipeId },
  });

  return NextResponse.json(entry, { status: 200 });
}

/**
 * DELETE /api/mealplan/[planId]/entries
 *
 * Clears whatever recipe occupies the `(dayOfWeek, mealType)` slot given
 * in the body. Ownership-checked like `PUT`. Scoped via `deleteMany`'s
 * `where` (mealPlanId + dayOfWeek + mealType) rather than `delete` on the
 * compound unique key, so clearing an already-empty slot is a no-op 200
 * instead of a 404 — mirrors the idempotent-unsave pattern from
 * DELETE /api/recipes/save/[recipeId].
 */
export async function DELETE(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = removeMealPlanEntryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const plan = await findOwnedMealPlan(planId, userId);
  if (!plan) {
    return NextResponse.json(
      { error: "Meal plan not found." },
      { status: 404 },
    );
  }

  const { dayOfWeek, mealType } = parsed.data;

  await prisma.mealPlanEntry.deleteMany({
    where: { mealPlanId: planId, dayOfWeek, mealType },
  });

  return new NextResponse(null, { status: 204 });
}
