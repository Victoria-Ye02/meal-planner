import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai/generateRecipes", () => ({
  generateRecipes: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(),
  recordGeneration: vi.fn(),
}));

import { generateRecipes } from "../../lib/ai/generateRecipes";
import { auth } from "../../lib/auth";
import { checkRateLimit, recordGeneration } from "../../lib/rateLimit";
import { POST } from "../../app/api/recipes/generate/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockGenerateRecipes = generateRecipes as unknown as ReturnType<
  typeof vi.fn
>;
const mockCheckRateLimit = checkRateLimit as unknown as ReturnType<
  typeof vi.fn
>;
const mockRecordGeneration = recordGeneration as unknown as ReturnType<
  typeof vi.fn
>;

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const AUTHED_SESSION = { user: { id: "user-1", email: "user@example.com" } };
const VALID_BODY = {
  ingredients: ["pasta", "garlic"],
  dietaryPreferences: ["vegetarian"],
};
const SAMPLE_RECIPES = [
  {
    title: "Garlic Pasta",
    ingredients: ["pasta", "garlic"],
    instructions: "Boil pasta. Add garlic.",
  },
];

describe("POST /api/recipes/generate", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockGenerateRecipes.mockReset();
    mockCheckRateLimit.mockReset();
    mockRecordGeneration.mockReset();

    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 19,
      limit: 20,
    });
    mockGenerateRecipes.mockResolvedValue({
      success: true,
      recipes: SAMPLE_RECIPES,
    });
    mockRecordGeneration.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with recipes for a valid, authenticated, under-limit request", async () => {
    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.recipes).toEqual(SAMPLE_RECIPES);

    // Ingredients/preferences are forwarded to the AI wrapper with the
    // client's `dietaryPreferences` mapped onto its `preferences` field.
    expect(mockGenerateRecipes).toHaveBeenCalledWith({
      ingredients: ["pasta", "garlic"],
      preferences: ["vegetarian"],
    });
    // Usage is only recorded once generation actually succeeds.
    expect(mockRecordGeneration).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(mockGenerateRecipes).not.toHaveBeenCalled();
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no user id", async () => {
    mockAuth.mockResolvedValue({ user: { email: "user@example.com" } });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
  });

  it("returns 400 for an empty ingredients list", async () => {
    const response = await POST(
      makeRequest({ ingredients: [], dietaryPreferences: [] }),
    );

    expect(response.status).toBe(400);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockGenerateRecipes).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body (wrong types)", async () => {
    const response = await POST(makeRequest({ ingredients: "not-an-array" }));

    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid JSON", async () => {
    const request = new Request("http://localhost/api/recipes/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not valid json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it("returns 429 when the user is over their daily rate limit", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 20,
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(429);
    expect(mockGenerateRecipes).not.toHaveBeenCalled();
    expect(mockRecordGeneration).not.toHaveBeenCalled();
  });

  it("returns 502 with a clean error (not a crash) when the AI call fails", async () => {
    mockGenerateRecipes.mockResolvedValue({
      success: false,
      error: "AI recipe generation service returned malformed JSON.",
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toMatch(/malformed JSON/i);
    // A failed generation should not count against the user's daily cap.
    expect(mockRecordGeneration).not.toHaveBeenCalled();
  });
});
