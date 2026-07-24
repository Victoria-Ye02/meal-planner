import { redirect } from "next/navigation";
import { IconCalendarWeek, IconHeart, IconSparkles } from "@tabler/icons-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentWeekStartDate } from "@/lib/mealPlan";

import { GenerateForm } from "./GenerateForm";

export default async function GeneratePage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const weekStartDate = getCurrentWeekStartDate(new Date());

  // Read-only stats for the summary row below the hero. Unlike the meal
  // plan page, viewing Generate must never create a MealPlan row as a side
  // effect — a plain `findFirst` (not `upsert`) so "0 meals planned" is a
  // real, distinct state from "a plan now exists".
  const [recipesSavedCount, currentWeekPlan, recipesGeneratedCount] =
    await Promise.all([
      prisma.savedRecipe.count({ where: { userId } }),
      prisma.mealPlan.findFirst({
        where: { userId, weekStartDate },
        select: { _count: { select: { entries: true } } },
      }),
      prisma.aiGenerationLog.count({
        where: { userId, createdAt: { gte: weekStartDate } },
      }),
    ]);

  const stats = [
    {
      label: "Recipes saved",
      value: recipesSavedCount,
      icon: IconHeart,
    },
    {
      label: "Meals planned this week",
      value: currentWeekPlan?._count.entries ?? 0,
      icon: IconCalendarWeek,
    },
    {
      label: "Recipes generated this week",
      value: recipesGeneratedCount,
      icon: IconSparkles,
    },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-gradient-to-br from-primary to-[oklch(0.5_0.16_20)] px-6 py-10 sm:py-12">
        <div className="mx-auto w-full max-w-4xl text-center sm:text-left">
          <h1 className="text-2xl font-semibold tracking-tight text-primary-foreground sm:text-3xl">
            What&apos;s in your kitchen?
          </h1>
          <p className="mt-2 max-w-prose text-primary-foreground/85 sm:mx-0">
            Add the ingredients you have on hand and any dietary preferences —
            the AI will suggest a few things to cook.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-6 px-6 py-8">
        <div className="w-full max-w-4xl">
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <stat.icon size={20} stroke={1.75} aria-hidden="true" />
                </div>
                <div>
                  <div className="font-display text-xl font-semibold text-foreground">
                    {stat.value}
                  </div>
                  <div className="text-xs text-muted">{stat.label}</div>
                </div>
              </div>
            ))}
          </div>

          <GenerateForm />
        </div>
      </div>
    </div>
  );
}
