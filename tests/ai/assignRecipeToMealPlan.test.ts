import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    recipe: {
      findFirst: vi.fn(),
    },
    mealPlan: {
      upsert: vi.fn(),
    },
    mealPlanEntry: {
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/db";
import { assignRecipeToMealPlan } from "../../lib/ai/assignRecipeToMealPlan";

const mockRecipeFindFirst = prisma.recipe.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const mockMealPlanUpsert = prisma.mealPlan.upsert as unknown as ReturnType<
  typeof vi.fn
>;
const mockMealPlanEntryUpsert = prisma.mealPlanEntry
  .upsert as unknown as ReturnType<typeof vi.fn>;

const SAMPLE_RECIPE = { id: "recipe-1", title: "Garlic Pasta" };
const SAMPLE_PLAN = { id: "plan-1" };

describe("assignRecipeToMealPlan", () => {
  beforeEach(() => {
    mockRecipeFindFirst.mockReset();
    mockMealPlanUpsert.mockReset();
    mockMealPlanEntryUpsert.mockReset();

    mockRecipeFindFirst.mockResolvedValue(SAMPLE_RECIPE);
    mockMealPlanUpsert.mockResolvedValue(SAMPLE_PLAN);
    mockMealPlanEntryUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("assigns a saved recipe to a slot and returns a success result with the recipe title and day label", async () => {
    const result = await assignRecipeToMealPlan({
      userId: "user-1",
      recipeId: "recipe-1",
      dayOfWeek: 0,
      mealType: "dinner",
    });

    expect(result).toEqual({
      success: true,
      recipeTitle: "Garlic Pasta",
      dayLabel: "Sunday",
      mealType: "dinner",
    });
  });

  it("scopes the recipe-ownership check to createdBy OR savedBy this user (same pattern as the entries route)", async () => {
    await assignRecipeToMealPlan({
      userId: "user-42",
      recipeId: "recipe-1",
      dayOfWeek: 1,
      mealType: "lunch",
    });

    expect(mockRecipeFindFirst).toHaveBeenCalledWith({
      where: {
        id: "recipe-1",
        OR: [
          { createdBy: "user-42" },
          { savedBy: { some: { userId: "user-42" } } },
        ],
      },
    });
  });

  it("rejects with a typed error (not a throw) when the recipe doesn't belong to the user", async () => {
    mockRecipeFindFirst.mockResolvedValue(null);

    const result = await assignRecipeToMealPlan({
      userId: "user-1",
      recipeId: "someone-elses-recipe",
      dayOfWeek: 0,
      mealType: "dinner",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0);
    }
    expect(mockMealPlanUpsert).not.toHaveBeenCalled();
    expect(mockMealPlanEntryUpsert).not.toHaveBeenCalled();
  });

  it("get-or-creates the current week's plan via upsert (never a plain create, to avoid duplicate-plan races)", async () => {
    await assignRecipeToMealPlan({
      userId: "user-1",
      recipeId: "recipe-1",
      dayOfWeek: 2,
      mealType: "breakfast",
    });

    expect(mockMealPlanUpsert).toHaveBeenCalledTimes(1);
    const call = mockMealPlanUpsert.mock.calls[0][0];
    expect(call.update).toEqual({});
    expect(call.create.userId).toBe("user-1");
  });

  it("upserts the entry (replacing whatever was in that slot) rather than failing on the unique constraint", async () => {
    await assignRecipeToMealPlan({
      userId: "user-1",
      recipeId: "recipe-1",
      dayOfWeek: 3,
      mealType: "lunch",
    });

    expect(mockMealPlanEntryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mealPlanId_dayOfWeek_mealType: {
            mealPlanId: "plan-1",
            dayOfWeek: 3,
            mealType: "lunch",
          },
        },
        create: expect.objectContaining({
          mealPlanId: "plan-1",
          dayOfWeek: 3,
          mealType: "lunch",
          recipeId: "recipe-1",
        }),
        update: expect.objectContaining({ recipeId: "recipe-1" }),
      }),
    );
  });

  it("maps every dayOfWeek (0-6) to the correct label", async () => {
    const labels = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    for (let day = 0; day < 7; day++) {
      const result = await assignRecipeToMealPlan({
        userId: "user-1",
        recipeId: "recipe-1",
        dayOfWeek: day,
        mealType: "dinner",
      });
      expect(result.success && result.dayLabel).toBe(labels[day]);
    }
  });
});
