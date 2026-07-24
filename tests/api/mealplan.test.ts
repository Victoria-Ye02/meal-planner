import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    mealPlan: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    mealPlanEntry: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    recipe: {
      findFirst: vi.fn(),
    },
  },
}));

import { Prisma } from "../../app/generated/prisma/client";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { GET as getPlan } from "../../app/api/mealplan/[planId]/route";
import {
  DELETE as deleteEntry,
  PUT as putEntry,
} from "../../app/api/mealplan/[planId]/entries/route";
import {
  GET as listPlans,
  POST as createPlan,
} from "../../app/api/mealplan/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockPlanCreate = prisma.mealPlan.create as unknown as ReturnType<
  typeof vi.fn
>;
const mockPlanFindFirst = prisma.mealPlan.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const mockPlanFindMany = prisma.mealPlan.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const mockEntryFindMany = prisma.mealPlanEntry
  .findMany as unknown as ReturnType<typeof vi.fn>;
const mockEntryUpsert = prisma.mealPlanEntry.upsert as unknown as ReturnType<
  typeof vi.fn
>;
const mockEntryDeleteMany = prisma.mealPlanEntry
  .deleteMany as unknown as ReturnType<typeof vi.fn>;
const mockRecipeFindFirst = prisma.recipe.findFirst as unknown as ReturnType<
  typeof vi.fn
>;

const AUTHED_SESSION = { user: { id: "user-1", email: "user@example.com" } };
const WEEK_START = "2026-07-26T00:00:00.000Z";

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/mealplan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(query = "") {
  return new Request(`http://localhost/api/mealplan${query}`);
}

function makePutRequest(planId: string, body: unknown) {
  return new Request(`http://localhost/api/mealplan/${planId}/entries`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteEntryRequest(planId: string, body: unknown) {
  return new Request(`http://localhost/api/mealplan/${planId}/entries`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockAuth.mockReset();
  mockPlanCreate.mockReset();
  mockPlanFindFirst.mockReset();
  mockPlanFindMany.mockReset();
  mockEntryFindMany.mockReset();
  mockEntryUpsert.mockReset();
  mockEntryDeleteMany.mockReset();
  mockRecipeFindFirst.mockReset();

  mockAuth.mockResolvedValue(AUTHED_SESSION);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/mealplan", () => {
  it("creates a MealPlan for the current user and persists weekStartDate", async () => {
    mockPlanCreate.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
    });

    const response = await createPlan(
      makePostRequest({ weekStartDate: WEEK_START }),
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe("plan-1");
    expect(json.entries).toEqual([]);

    expect(mockPlanCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", weekStartDate: new Date(WEEK_START) },
    });
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await createPlan(
      makePostRequest({ weekStartDate: WEEK_START }),
    );

    expect(response.status).toBe(401);
    expect(mockPlanCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing weekStartDate", async () => {
    const response = await createPlan(makePostRequest({}));

    expect(response.status).toBe(400);
    expect(mockPlanCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid weekStartDate", async () => {
    const response = await createPlan(
      makePostRequest({ weekStartDate: "not-a-date" }),
    );

    expect(response.status).toBe(400);
    expect(mockPlanCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/api/mealplan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });

    const response = await createPlan(request);

    expect(response.status).toBe(400);
  });

  it("normalizes weekStartDate to UTC midnight regardless of the time-of-day sent", async () => {
    mockPlanCreate.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
    });

    // Simulates a "local midnight" style input for the same calendar date
    // (e.g. what a client several hours behind UTC would send for
    // `<input type="date">`'s 2026-07-26) — not UTC midnight itself.
    await createPlan(
      makePostRequest({ weekStartDate: "2026-07-26T08:00:00.000Z" }),
    );

    expect(mockPlanCreate).toHaveBeenCalledWith({
      data: { userId: "user-1", weekStartDate: new Date(WEEK_START) },
    });
  });

  it("stores the same weekStartDate for two different time-of-day inputs on the same calendar date", async () => {
    mockPlanCreate.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
    });

    await createPlan(
      makePostRequest({ weekStartDate: "2026-07-26T00:00:00.000Z" }),
    );
    await createPlan(
      makePostRequest({ weekStartDate: "2026-07-26T08:00:00.000Z" }),
    );

    const firstStoredDate = mockPlanCreate.mock.calls[0]?.[0].data.weekStartDate;
    const secondStoredDate = mockPlanCreate.mock.calls[1]?.[0].data.weekStartDate;

    expect(firstStoredDate.getTime()).toBe(secondStoredDate.getTime());
    expect(firstStoredDate.getTime()).toBe(new Date(WEEK_START).getTime());
  });

  it("returns 409 with a clean error body when a plan for this week already exists (unique constraint), not a raw 500", async () => {
    const uniqueConstraintError = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      {
        code: "P2002",
        message: "Unique constraint failed on the fields: (`userId`,`weekStartDate`)",
      },
    );
    mockPlanCreate.mockRejectedValue(uniqueConstraintError);

    const response = await createPlan(
      makePostRequest({ weekStartDate: WEEK_START }),
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("A meal plan for this week already exists.");
  });

  it("propagates non-unique-constraint errors instead of swallowing them", async () => {
    mockPlanCreate.mockRejectedValue(new Error("unexpected database error"));

    await expect(
      createPlan(makePostRequest({ weekStartDate: WEEK_START })),
    ).rejects.toThrow("unexpected database error");
  });
});

describe("GET /api/mealplan", () => {
  it("lists the current user's plans when no weekStartDate is given", async () => {
    mockPlanFindMany.mockResolvedValue([
      { id: "plan-1", weekStartDate: new Date(WEEK_START) },
    ]);

    const response = await listPlans(makeGetRequest());

    expect(response.status).toBe(200);
    expect(mockPlanFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true, weekStartDate: true },
      orderBy: { weekStartDate: "desc" },
    });
  });

  it("returns a single plan with entries when weekStartDate matches", async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
      entries: [{ id: "entry-1", dayOfWeek: 1, mealType: "lunch" }],
    });

    const response = await listPlans(
      makeGetRequest(`?weekStartDate=${encodeURIComponent(WEEK_START)}`),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe("plan-1");
    expect(json.entries).toHaveLength(1);
  });

  it("returns 404 when no plan exists for the given weekStartDate", async () => {
    mockPlanFindFirst.mockResolvedValue(null);

    const response = await listPlans(
      makeGetRequest(`?weekStartDate=${encodeURIComponent(WEEK_START)}`),
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await listPlans(makeGetRequest());

    expect(response.status).toBe(401);
    expect(mockPlanFindMany).not.toHaveBeenCalled();
  });

  it("finds the plan when the query param uses a different time-of-day for the same calendar date as POST normalized to", async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
      entries: [],
    });

    // Same calendar date as WEEK_START (2026-07-26) but sent as
    // "local midnight" rather than UTC midnight — should still normalize to
    // the same DB lookup value POST would have stored.
    const response = await listPlans(
      makeGetRequest(
        `?weekStartDate=${encodeURIComponent("2026-07-26T08:00:00.000Z")}`,
      ),
    );

    expect(response.status).toBe(200);
    expect(mockPlanFindFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", weekStartDate: new Date(WEEK_START) },
      include: { entries: true },
    });
  });

  it("returns 400 for an invalid weekStartDate query parameter (validated through Zod)", async () => {
    const response = await listPlans(
      makeGetRequest("?weekStartDate=not-a-date"),
    );

    expect(response.status).toBe(400);
    expect(mockPlanFindFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/mealplan/[planId]", () => {
  it("returns the plan with entries when owned by the requesting user", async () => {
    mockPlanFindFirst.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
    });
    mockEntryFindMany.mockResolvedValue([
      {
        id: "entry-1",
        dayOfWeek: 0,
        mealType: "breakfast",
        recipeId: "recipe-1",
      },
    ]);

    const response = await getPlan(
      new Request("http://localhost/api/mealplan/plan-1"),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockPlanFindFirst).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: "user-1" },
    });
    const json = await response.json();
    expect(json.entries).toHaveLength(1);
  });

  it("returns 404 when the plan belongs to another user", async () => {
    mockPlanFindFirst.mockResolvedValue(null);

    const response = await getPlan(
      new Request("http://localhost/api/mealplan/plan-1"),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(404);
    expect(mockEntryFindMany).not.toHaveBeenCalled();
  });
});

describe("PUT /api/mealplan/[planId]/entries", () => {
  const VALID_ENTRY_BODY = {
    recipeId: "recipe-1",
    dayOfWeek: 2,
    mealType: "dinner",
  };

  beforeEach(() => {
    mockPlanFindFirst.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
    });
    mockRecipeFindFirst.mockResolvedValue({ id: "recipe-1" });
    mockEntryUpsert.mockResolvedValue({
      id: "entry-1",
      mealPlanId: "plan-1",
      recipeId: "recipe-1",
      dayOfWeek: 2,
      mealType: "dinner",
    });
  });

  it("assigns a recipe to a slot and persists it via upsert", async () => {
    const response = await putEntry(
      makePutRequest("plan-1", VALID_ENTRY_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockEntryUpsert).toHaveBeenCalledWith({
      where: {
        mealPlanId_dayOfWeek_mealType: {
          mealPlanId: "plan-1",
          dayOfWeek: 2,
          mealType: "dinner",
        },
      },
      create: {
        mealPlanId: "plan-1",
        recipeId: "recipe-1",
        dayOfWeek: 2,
        mealType: "dinner",
      },
      update: { recipeId: "recipe-1" },
    });
  });

  it("replaces an already-filled slot via upsert rather than erroring (re-assign is a clean update)", async () => {
    await putEntry(
      makePutRequest("plan-1", { ...VALID_ENTRY_BODY, recipeId: "recipe-2" }),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(mockEntryUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { recipeId: "recipe-2" } }),
    );
  });

  it("supports assigning all three meal types across different days", async () => {
    const slots = [
      { recipeId: "recipe-1", dayOfWeek: 0, mealType: "breakfast" },
      { recipeId: "recipe-1", dayOfWeek: 3, mealType: "lunch" },
      { recipeId: "recipe-1", dayOfWeek: 6, mealType: "dinner" },
    ];

    for (const slot of slots) {
      const response = await putEntry(makePutRequest("plan-1", slot), {
        params: Promise.resolve({ planId: "plan-1" }),
      });
      expect(response.status).toBe(200);
    }

    expect(mockEntryUpsert).toHaveBeenCalledTimes(3);
  });

  it("returns 404 and does not upsert when the plan belongs to another user", async () => {
    mockPlanFindFirst.mockResolvedValue(null);

    const response = await putEntry(
      makePutRequest("plan-1", VALID_ENTRY_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(404);
    expect(mockEntryUpsert).not.toHaveBeenCalled();
  });

  it("checks ownership against the requesting user's id, not an arbitrary user", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-2" } });
    mockPlanFindFirst.mockResolvedValue(null);

    await putEntry(makePutRequest("plan-1", VALID_ENTRY_BODY), {
      params: Promise.resolve({ planId: "plan-1" }),
    });

    expect(mockPlanFindFirst).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: "user-2" },
    });
  });

  it("returns 404 when the recipeId does not exist", async () => {
    mockRecipeFindFirst.mockResolvedValue(null);

    const response = await putEntry(
      makePutRequest("plan-1", VALID_ENTRY_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(404);
    expect(mockEntryUpsert).not.toHaveBeenCalled();
  });

  it("returns 404 when the recipeId exists but belongs to a different user (not created by, not saved by them)", async () => {
    // Simulates prisma.recipe.findFirst finding no row because the OR
    // ownership/saved-by filter excludes a recipe that exists but isn't
    // this user's — same 404 as a nonexistent recipeId, no leak either way.
    mockRecipeFindFirst.mockResolvedValue(null);

    const response = await putEntry(
      makePutRequest("plan-1", VALID_ENTRY_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(404);
    expect(mockRecipeFindFirst).toHaveBeenCalledWith({
      where: {
        id: "recipe-1",
        OR: [
          { createdBy: "user-1" },
          { savedBy: { some: { userId: "user-1" } } },
        ],
      },
    });
    expect(mockEntryUpsert).not.toHaveBeenCalled();
  });

  it("succeeds when the recipeId was created by the requesting user", async () => {
    mockRecipeFindFirst.mockResolvedValue({
      id: "recipe-1",
      createdBy: "user-1",
    });

    const response = await putEntry(
      makePutRequest("plan-1", VALID_ENTRY_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockEntryUpsert).toHaveBeenCalled();
  });

  it("succeeds when the recipeId was saved (not created) by the requesting user", async () => {
    mockRecipeFindFirst.mockResolvedValue({
      id: "recipe-1",
      createdBy: "someone-else",
    });

    const response = await putEntry(
      makePutRequest("plan-1", VALID_ENTRY_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockEntryUpsert).toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await putEntry(
      makePutRequest("plan-1", VALID_ENTRY_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(401);
    expect(mockEntryUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an out-of-range dayOfWeek", async () => {
    const response = await putEntry(
      makePutRequest("plan-1", { ...VALID_ENTRY_BODY, dayOfWeek: 7 }),
      { params: Promise.resolve({ planId: "plan-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockEntryUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid mealType", async () => {
    const response = await putEntry(
      makePutRequest("plan-1", { ...VALID_ENTRY_BODY, mealType: "brunch" }),
      { params: Promise.resolve({ planId: "plan-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mockEntryUpsert).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/mealplan/[planId]/entries", () => {
  const VALID_SLOT_BODY = { dayOfWeek: 2, mealType: "dinner" };

  beforeEach(() => {
    mockPlanFindFirst.mockResolvedValue({
      id: "plan-1",
      userId: "user-1",
      weekStartDate: new Date(WEEK_START),
    });
    mockEntryDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("removes the entry for the given slot", async () => {
    const response = await deleteEntry(
      makeDeleteEntryRequest("plan-1", VALID_SLOT_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(204);
    expect(mockEntryDeleteMany).toHaveBeenCalledWith({
      where: { mealPlanId: "plan-1", dayOfWeek: 2, mealType: "dinner" },
    });
  });

  it("is idempotent: returns success even if the slot is already empty", async () => {
    mockEntryDeleteMany.mockResolvedValue({ count: 0 });

    const response = await deleteEntry(
      makeDeleteEntryRequest("plan-1", VALID_SLOT_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(204);
  });

  it("returns 404 and does not delete when the plan belongs to another user", async () => {
    mockPlanFindFirst.mockResolvedValue(null);

    const response = await deleteEntry(
      makeDeleteEntryRequest("plan-1", VALID_SLOT_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(404);
    expect(mockEntryDeleteMany).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await deleteEntry(
      makeDeleteEntryRequest("plan-1", VALID_SLOT_BODY),
      {
        params: Promise.resolve({ planId: "plan-1" }),
      },
    );

    expect(response.status).toBe(401);
    expect(mockEntryDeleteMany).not.toHaveBeenCalled();
  });
});
