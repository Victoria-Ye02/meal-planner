import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai/chatAssistant", () => ({
  askAssistant: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  reserveGenerationSlot: vi.fn(),
  releaseGenerationSlot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    savedRecipe: {
      findMany: vi.fn(),
    },
    mealPlan: {
      findFirst: vi.fn(),
    },
  },
}));

import { askAssistant } from "../../lib/ai/chatAssistant";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";
import {
  releaseGenerationSlot,
  reserveGenerationSlot,
} from "../../lib/rateLimit";
import { POST } from "../../app/api/assistant/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockAskAssistant = askAssistant as unknown as ReturnType<typeof vi.fn>;
const mockReserveGenerationSlot =
  reserveGenerationSlot as unknown as ReturnType<typeof vi.fn>;
const mockReleaseGenerationSlot =
  releaseGenerationSlot as unknown as ReturnType<typeof vi.fn>;
const mockSavedRecipeFindMany = prisma.savedRecipe
  .findMany as unknown as ReturnType<typeof vi.fn>;
const mockMealPlanFindFirst = prisma.mealPlan
  .findFirst as unknown as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const AUTHED_SESSION = { user: { id: "user-1", email: "user@example.com" } };
const VALID_BODY = { message: "What can I cook tonight?", history: [] };

describe("POST /api/assistant", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockAskAssistant.mockReset();
    mockReserveGenerationSlot.mockReset();
    mockReleaseGenerationSlot.mockReset();
    mockSavedRecipeFindMany.mockReset();
    mockMealPlanFindFirst.mockReset();

    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockReserveGenerationSlot.mockResolvedValue({
      allowed: true,
      remaining: 19,
      limit: 20,
      logId: "log-1",
    });
    mockSavedRecipeFindMany.mockResolvedValue([]);
    mockMealPlanFindFirst.mockResolvedValue(null);
    mockAskAssistant.mockResolvedValue({
      success: true,
      reply: "You could make the pasta you saved.",
    });
    mockReleaseGenerationSlot.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(mockAskAssistant).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: {} });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
  });

  it("returns 400 for an empty message", async () => {
    const response = await POST(makeRequest({ message: "", history: [] }));

    expect(response.status).toBe(400);
    expect(mockAskAssistant).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 429 when the shared daily AI quota is exceeded", async () => {
    mockReserveGenerationSlot.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 20,
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(429);
    expect(mockAskAssistant).not.toHaveBeenCalled();
  });

  it("retrieves saved recipes and the current week's meal plan and forwards them into the system prompt", async () => {
    mockSavedRecipeFindMany.mockResolvedValue([
      {
        recipe: {
          title: "Garlic Pasta",
          ingredients: ["pasta", "garlic"],
          instructions: "Boil, saute, combine.",
        },
      },
    ]);
    mockMealPlanFindFirst.mockResolvedValue({
      entries: [
        {
          dayOfWeek: 2,
          mealType: "dinner",
          recipe: { title: "Garlic Pasta" },
        },
      ],
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
    const call = mockAskAssistant.mock.calls[0][0];
    expect(call.systemPrompt).toContain("Garlic Pasta");
    expect(call.systemPrompt).toContain("dinner");
  });

  it("never creates a MealPlan row as a side effect (read-only findFirst, no upsert/create)", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockMealPlanFindFirst).toHaveBeenCalled();
    // The mock module only defines findFirst — if the route ever called
    // create/upsert on mealPlan, this would throw (property doesn't exist
    // on the mock), which the test runner would report as a failure.
  });

  it("handles an empty saved-recipes list and no meal plan gracefully (200, not a crash)", async () => {
    mockSavedRecipeFindMany.mockResolvedValue([]);
    mockMealPlanFindFirst.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
  });

  it("forwards conversation history plus the new message to askAssistant in order", async () => {
    const history = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];

    await POST(makeRequest({ message: "what next", history }));

    const call = mockAskAssistant.mock.calls[0][0];
    expect(call.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "what next" },
    ]);
  });

  it("returns 502 and releases the rate-limit slot when the AI call fails", async () => {
    mockAskAssistant.mockResolvedValue({
      success: false,
      error: "The cooking assistant timed out. Please try again.",
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(502);
    expect(mockReleaseGenerationSlot).toHaveBeenCalledWith("log-1");
  });

  it("returns 200 with the assistant's reply on success", async () => {
    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.reply).toBe("You could make the pasta you saved.");
  });
});
