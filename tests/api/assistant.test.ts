import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai/chatAssistant", () => ({
  askAssistant: vi.fn(),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  generateEmbedding: vi.fn(),
}));

vi.mock("@/lib/ai/vectorSearch", () => ({
  findSimilarSavedRecipes: vi.fn(),
}));

vi.mock("@/lib/ai/assignRecipeToMealPlan", () => ({
  assignRecipeToMealPlan: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  reserveGenerationSlot: vi.fn(),
  releaseGenerationSlot: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    savedRecipe: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    mealPlan: {
      findFirst: vi.fn(),
    },
  },
}));

import { assignRecipeToMealPlan } from "../../lib/ai/assignRecipeToMealPlan";
import { askAssistant } from "../../lib/ai/chatAssistant";
import { generateEmbedding } from "../../lib/ai/embeddings";
import { findSimilarSavedRecipes } from "../../lib/ai/vectorSearch";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";
import {
  releaseGenerationSlot,
  reserveGenerationSlot,
} from "../../lib/rateLimit";
import { POST } from "../../app/api/assistant/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockAskAssistant = askAssistant as unknown as ReturnType<typeof vi.fn>;
const mockGenerateEmbedding = generateEmbedding as unknown as ReturnType<
  typeof vi.fn
>;
const mockFindSimilarSavedRecipes =
  findSimilarSavedRecipes as unknown as ReturnType<typeof vi.fn>;
const mockAssignRecipeToMealPlan =
  assignRecipeToMealPlan as unknown as ReturnType<typeof vi.fn>;
const mockReserveGenerationSlot =
  reserveGenerationSlot as unknown as ReturnType<typeof vi.fn>;
const mockReleaseGenerationSlot =
  releaseGenerationSlot as unknown as ReturnType<typeof vi.fn>;
const mockSavedRecipeFindMany = prisma.savedRecipe
  .findMany as unknown as ReturnType<typeof vi.fn>;
const mockSavedRecipeCount = prisma.savedRecipe.count as unknown as ReturnType<
  typeof vi.fn
>;
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
const SAMPLE_EMBEDDING = Array.from({ length: 1536 }, () => 0.01);
const TEXT_REPLY = {
  success: true,
  reply: "You could make the pasta you saved.",
  toolCalls: [],
};

describe("POST /api/assistant", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockAskAssistant.mockReset();
    mockGenerateEmbedding.mockReset();
    mockFindSimilarSavedRecipes.mockReset();
    mockAssignRecipeToMealPlan.mockReset();
    mockReserveGenerationSlot.mockReset();
    mockReleaseGenerationSlot.mockReset();
    mockSavedRecipeFindMany.mockReset();
    mockSavedRecipeCount.mockReset();
    mockMealPlanFindFirst.mockReset();

    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockReserveGenerationSlot.mockResolvedValue({
      allowed: true,
      remaining: 19,
      limit: 20,
      logId: "log-1",
    });
    mockGenerateEmbedding.mockResolvedValue({
      success: true,
      embedding: SAMPLE_EMBEDDING,
    });
    mockFindSimilarSavedRecipes.mockResolvedValue([]);
    mockSavedRecipeFindMany.mockResolvedValue([]);
    mockSavedRecipeCount.mockResolvedValue(0);
    mockMealPlanFindFirst.mockResolvedValue(null);
    mockAskAssistant.mockResolvedValue(TEXT_REPLY);
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
    expect(mockGenerateEmbedding).not.toHaveBeenCalled();
  });

  it("embeds the user's message and retrieves saved recipes via vector similarity search", async () => {
    mockFindSimilarSavedRecipes.mockResolvedValue([
      {
        recipeId: "r1",
        title: "Garlic Pasta",
        ingredients: ["pasta", "garlic"],
        instructions: "Boil, saute, combine.",
      },
    ]);
    mockSavedRecipeCount.mockResolvedValue(1);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(mockGenerateEmbedding).toHaveBeenCalledWith(VALID_BODY.message);
    expect(mockFindSimilarSavedRecipes).toHaveBeenCalledWith({
      userId: "user-1",
      queryEmbedding: SAMPLE_EMBEDDING,
      limit: 5,
    });
    // Direct-fetch fallback path must NOT run when vector search succeeds.
    expect(mockSavedRecipeFindMany).not.toHaveBeenCalled();

    const call = mockAskAssistant.mock.calls[0][0];
    expect(call.systemPrompt).toContain("Garlic Pasta");
  });

  it("passes the assign_recipe_to_meal_plan tool to the first askAssistant call", async () => {
    await POST(makeRequest(VALID_BODY));

    const call = mockAskAssistant.mock.calls[0][0];
    expect(call.tools).toEqual([
      expect.objectContaining({
        type: "function",
        function: expect.objectContaining({
          name: "assign_recipe_to_meal_plan",
        }),
      }),
    ]);
  });

  it("falls back to a direct saved-recipe fetch when embedding the query fails", async () => {
    mockGenerateEmbedding.mockResolvedValue({
      success: false,
      error: "Embedding service returned an error (status 500).",
    });
    mockSavedRecipeFindMany.mockResolvedValue([
      {
        recipe: {
          id: "r2",
          title: "Fallback Tacos",
          ingredients: ["tortilla", "beef"],
          instructions: "Cook, fill, fold.",
        },
      },
    ]);
    mockSavedRecipeCount.mockResolvedValue(1);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
    expect(mockFindSimilarSavedRecipes).not.toHaveBeenCalled();
    expect(mockSavedRecipeFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" }, take: 5 }),
    );

    const call = mockAskAssistant.mock.calls[0][0];
    expect(call.systemPrompt).toContain("Fallback Tacos");
  });

  it("retrieves the current week's meal plan (direct fetch, not vector search) and forwards it into the system prompt", async () => {
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
    expect(call.systemPrompt).toContain("dinner");
    expect(call.systemPrompt).toContain("Garlic Pasta");
  });

  it("never creates a MealPlan row as a side effect of a plain question (read-only findFirst, no upsert/create)", async () => {
    await POST(makeRequest(VALID_BODY));

    expect(mockMealPlanFindFirst).toHaveBeenCalled();
    expect(mockAssignRecipeToMealPlan).not.toHaveBeenCalled();
  });

  it("tells the model when the similarity-search result is a partial list (fewer than the user's total saved recipes)", async () => {
    mockFindSimilarSavedRecipes.mockResolvedValue([
      {
        recipeId: "r1",
        title: "One Of Five",
        ingredients: ["x"],
        instructions: "y",
      },
    ]);
    mockSavedRecipeCount.mockResolvedValue(12);

    await POST(makeRequest(VALID_BODY));

    const call = mockAskAssistant.mock.calls[0][0];
    expect(call.systemPrompt).toContain("12");
    expect(call.systemPrompt.toLowerCase()).toContain("not");
  });

  it("handles an empty saved-recipes list and no meal plan gracefully (200, not a crash)", async () => {
    mockFindSimilarSavedRecipes.mockResolvedValue([]);
    mockSavedRecipeCount.mockResolvedValue(0);
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

  describe("tool call confirmation flow", () => {
    const TOOL_CALL = {
      id: "call_1",
      name: "assign_recipe_to_meal_plan",
      argumentsJson: JSON.stringify({
        recipeId: "recipe-1",
        dayOfWeek: 0,
        mealType: "dinner",
      }),
    };

    it("does not touch the database when the model replies with plain text (no tool call = no write)", async () => {
      const response = await POST(makeRequest(VALID_BODY));

      expect(response.status).toBe(200);
      expect(mockAssignRecipeToMealPlan).not.toHaveBeenCalled();
      // Only the first askAssistant call happens; no follow-up round.
      expect(mockAskAssistant).toHaveBeenCalledTimes(1);
    });

    it("executes the write, makes a follow-up askAssistant call with the tool result, and returns mealPlanUpdate on success", async () => {
      mockAskAssistant
        .mockResolvedValueOnce({
          success: true,
          reply: "",
          toolCalls: [TOOL_CALL],
        })
        .mockResolvedValueOnce({
          success: true,
          reply: "Done! I've added Garlic Pasta to Sunday dinner.",
          toolCalls: [],
        });
      mockAssignRecipeToMealPlan.mockResolvedValue({
        success: true,
        recipeTitle: "Garlic Pasta",
        dayLabel: "Sunday",
        mealType: "dinner",
      });

      const response = await POST(
        makeRequest({ message: "yes, assign it", history: [] }),
      );

      expect(response.status).toBe(200);
      expect(mockAssignRecipeToMealPlan).toHaveBeenCalledWith({
        userId: "user-1",
        recipeId: "recipe-1",
        dayOfWeek: 0,
        mealType: "dinner",
      });
      expect(mockAskAssistant).toHaveBeenCalledTimes(2);
      const secondCall = mockAskAssistant.mock.calls[1][0];
      expect(secondCall.toolResult.call).toEqual(TOOL_CALL);
      expect(JSON.parse(secondCall.toolResult.resultContent)).toEqual({
        success: true,
        recipeTitle: "Garlic Pasta",
        dayLabel: "Sunday",
        mealType: "dinner",
      });

      const json = await response.json();
      expect(json.reply).toBe(
        "Done! I've added Garlic Pasta to Sunday dinner.",
      );
      expect(json.mealPlanUpdate).toEqual({
        recipeTitle: "Garlic Pasta",
        dayLabel: "Sunday",
        mealType: "dinner",
      });
    });

    it("rejects a recipeId the user doesn't own (assignRecipeToMealPlan's own ownership check fails) without a mealPlanUpdate in the response", async () => {
      mockAskAssistant
        .mockResolvedValueOnce({
          success: true,
          reply: "",
          toolCalls: [TOOL_CALL],
        })
        .mockResolvedValueOnce({
          success: true,
          reply: "I couldn't find that recipe in your saved recipes.",
          toolCalls: [],
        });
      mockAssignRecipeToMealPlan.mockResolvedValue({
        success: false,
        error:
          "That recipe isn't one of your saved recipes, so it can't be assigned.",
      });

      const response = await POST(
        makeRequest({ message: "yes, assign it", history: [] }),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.mealPlanUpdate).toBeUndefined();
      // The failure is fed back to the model as the tool result, not silently dropped.
      const secondCall = mockAskAssistant.mock.calls[1][0];
      expect(JSON.parse(secondCall.toolResult.resultContent).success).toBe(
        false,
      );
    });

    it("passes the authenticated session's userId to assignRecipeToMealPlan, never anything from the request body (cross-user protection)", async () => {
      mockAuth.mockResolvedValue({ user: { id: "user-999" } });
      mockAskAssistant
        .mockResolvedValueOnce({
          success: true,
          reply: "",
          toolCalls: [TOOL_CALL],
        })
        .mockResolvedValueOnce(TEXT_REPLY);
      mockAssignRecipeToMealPlan.mockResolvedValue({
        success: true,
        recipeTitle: "Garlic Pasta",
        dayLabel: "Sunday",
        mealType: "dinner",
      });

      await POST(makeRequest({ message: "yes, assign it", history: [] }));

      expect(mockAssignRecipeToMealPlan).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-999" }),
      );
    });

    it("rejects malformed tool call arguments (invalid dayOfWeek) before ever calling assignRecipeToMealPlan", async () => {
      mockAskAssistant
        .mockResolvedValueOnce({
          success: true,
          reply: "",
          toolCalls: [
            {
              id: "call_2",
              name: "assign_recipe_to_meal_plan",
              argumentsJson: JSON.stringify({
                recipeId: "recipe-1",
                dayOfWeek: 9, // invalid — must be 0-6
                mealType: "dinner",
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          reply: "Something went wrong assigning that.",
          toolCalls: [],
        });

      const response = await POST(
        makeRequest({ message: "yes, assign it", history: [] }),
      );

      expect(response.status).toBe(200);
      expect(mockAssignRecipeToMealPlan).not.toHaveBeenCalled();
      const secondCall = mockAskAssistant.mock.calls[1][0];
      expect(JSON.parse(secondCall.toolResult.resultContent).success).toBe(
        false,
      );
    });

    it("rejects malformed tool call arguments (invalid JSON) before ever calling assignRecipeToMealPlan", async () => {
      mockAskAssistant
        .mockResolvedValueOnce({
          success: true,
          reply: "",
          toolCalls: [
            {
              id: "call_3",
              name: "assign_recipe_to_meal_plan",
              argumentsJson: "{not valid json",
            },
          ],
        })
        .mockResolvedValueOnce({
          success: true,
          reply: "Something went wrong.",
          toolCalls: [],
        });

      const response = await POST(
        makeRequest({ message: "yes, assign it", history: [] }),
      );

      expect(response.status).toBe(200);
      expect(mockAssignRecipeToMealPlan).not.toHaveBeenCalled();
    });

    it("returns 502 and releases the rate-limit slot when the follow-up (post-tool-call) askAssistant call fails", async () => {
      mockAskAssistant
        .mockResolvedValueOnce({
          success: true,
          reply: "",
          toolCalls: [TOOL_CALL],
        })
        .mockResolvedValueOnce({
          success: false,
          error: "The cooking assistant timed out. Please try again.",
        });
      mockAssignRecipeToMealPlan.mockResolvedValue({
        success: true,
        recipeTitle: "Garlic Pasta",
        dayLabel: "Sunday",
        mealType: "dinner",
      });

      const response = await POST(
        makeRequest({ message: "yes, assign it", history: [] }),
      );

      expect(response.status).toBe(502);
      expect(mockReleaseGenerationSlot).toHaveBeenCalledWith("log-1");
    });
  });
});
