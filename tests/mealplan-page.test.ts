import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    mealPlan: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    savedRecipe: {
      findMany: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import MealPlanPage from "../app/(dashboard)/mealplan/page";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockUpsert = prisma.mealPlan.upsert as unknown as ReturnType<
  typeof vi.fn
>;
const mockFindFirst = prisma.mealPlan.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const mockCreate = prisma.mealPlan.create as unknown as ReturnType<
  typeof vi.fn
>;
const mockSavedRecipeFindMany = prisma.savedRecipe
  .findMany as unknown as ReturnType<typeof vi.fn>;

const AUTHED_SESSION = { user: { id: "user-1", email: "user@example.com" } };

describe("MealPlanPage get-or-create", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockUpsert.mockReset();
    mockFindFirst.mockReset();
    mockCreate.mockReset();
    mockSavedRecipeFindMany.mockReset();

    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockSavedRecipeFindMany.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date("2026-07-19T00:00:00.000Z"),
      entries: [],
    });
  });

  it("resolves this week's plan via a single atomic upsert keyed on the userId_weekStartDate unique constraint, never findFirst-then-create", async () => {
    await MealPlanPage();

    // The race this closes: two near-simultaneous page loads (two tabs, a
    // double-click nav) must resolve to the same row rather than each
    // independently observing "no plan yet" and creating a duplicate.
    // upsert against the DB-level @@unique([userId, weekStartDate])
    // constraint is what guarantees that; findFirst-then-create gives no
    // such guarantee, so this asserts the old pattern is gone entirely.
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();

    const call = mockUpsert.mock.calls[0]?.[0];
    expect(call.update).toEqual({});

    const whereKey = call.where.userId_weekStartDate;
    expect(whereKey.userId).toBe("user-1");
    // weekStartDate must be UTC midnight (normalizeWeekStartDate's
    // contract) and identical between where/create so the upsert can't
    // itself create a mismatched row.
    expect(whereKey.weekStartDate.getUTCHours()).toBe(0);
    expect(whereKey.weekStartDate.getUTCMinutes()).toBe(0);

    expect(call.create).toEqual({
      userId: "user-1",
      weekStartDate: whereKey.weekStartDate,
    });
  });

  it("redirects to /login (and never queries the database) when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(MealPlanPage()).rejects.toThrow();

    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
