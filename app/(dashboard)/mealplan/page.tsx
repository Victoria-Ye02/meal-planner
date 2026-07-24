import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentWeekStartDate } from "@/lib/mealPlan";
import {
  MealPlanCalendar,
  type MealPlanDay,
  type MealPlanEntryData,
  type SavedRecipeOption,
} from "@/components/MealPlanCalendar";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default async function MealPlanPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const weekStartDate = getCurrentWeekStartDate(new Date());

  // Get-or-create "this week's" plan. `MealPlan` has a `@@unique([userId,
  // weekStartDate])` constraint (see prisma/schema.prisma) specifically so
  // this can be a single atomic `upsert` instead of a `findFirst`-then-
  // `create` — two near-simultaneous page loads (two tabs, a double-click
  // navigation) racing here would otherwise both observe "no plan yet" and
  // each create a duplicate row for the week, since neither Postgres nor
  // Prisma give any isolation between an app-level read and a later write
  // without either a transaction+lock or a unique index for the database
  // to arbitrate against. `upsert` pushes that arbitration into the DB: both
  // requests resolve to the same single row. Queried directly via prisma
  // rather than over HTTP, the same direct-fetch pattern the Favorites page
  // (Task 9) uses for its Server Component data loading. `entries: {
  // include: { recipe: true } }` joins in the recipe title for display —
  // the entries API itself doesn't include it, this page needs the join, so
  // it queries prisma directly instead of the narrower shape GET
  // /api/mealplan returns.
  const plan = await prisma.mealPlan.upsert({
    where: { userId_weekStartDate: { userId, weekStartDate } },
    update: {},
    create: { userId, weekStartDate },
    include: { entries: { include: { recipe: true } } },
  });

  // Picker list for assigning a recipe to a slot is scoped to the current
  // user's saved recipes only, per task-11-brief.md — same query Favorites
  // (Task 9) uses.
  const savedRecipeRows = await prisma.savedRecipe.findMany({
    where: { userId },
    include: { recipe: true },
    orderBy: { savedAt: "desc" },
  });

  const savedRecipes: SavedRecipeOption[] = savedRecipeRows.map(
    ({ recipe }) => ({
      id: recipe.id,
      title: recipe.title,
      ingredients: recipe.ingredients,
    }),
  );

  const entries: MealPlanEntryData[] = plan.entries.map((entry) => ({
    id: entry.id,
    dayOfWeek: entry.dayOfWeek,
    mealType: entry.mealType,
    recipeId: entry.recipeId,
    recipeTitle: entry.recipe.title,
    recipeIngredients: entry.recipe.ingredients,
  }));

  const days: MealPlanDay[] = DAY_LABELS.map((label, dayOfWeek) => {
    const date = new Date(weekStartDate);
    date.setUTCDate(date.getUTCDate() + dayOfWeek);
    return {
      dayOfWeek,
      label,
      dateLabel: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }),
    };
  });

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-8 sm:py-10">
      <div className="w-full max-w-5xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          This week&apos;s meal plan
        </h1>
        <p className="mb-6 text-muted">
          Assign a saved recipe to any day and meal below.
        </p>
        <MealPlanCalendar
          planId={plan.id}
          days={days}
          initialEntries={entries}
          savedRecipes={savedRecipes}
        />
      </div>
    </div>
  );
}
