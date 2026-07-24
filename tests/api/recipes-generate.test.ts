import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/ai/generateRecipes", () => ({
  generateRecipes: vi.fn(),
}));

vi.mock("@/lib/rateLimit", () => ({
  reserveGenerationSlot: vi.fn(),
  releaseGenerationSlot: vi.fn(),
}));

import { generateRecipes } from "../../lib/ai/generateRecipes";
import { auth } from "../../lib/auth";
import {
  releaseGenerationSlot,
  reserveGenerationSlot,
} from "../../lib/rateLimit";
import { POST } from "../../app/api/recipes/generate/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockGenerateRecipes = generateRecipes as unknown as ReturnType<
  typeof vi.fn
>;
const mockReserveGenerationSlot = reserveGenerationSlot as unknown as ReturnType<
  typeof vi.fn
>;
const mockReleaseGenerationSlot = releaseGenerationSlot as unknown as ReturnType<
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
    mockReserveGenerationSlot.mockReset();
    mockReleaseGenerationSlot.mockReset();

    mockAuth.mockResolvedValue(AUTHED_SESSION);
    mockReserveGenerationSlot.mockResolvedValue({
      allowed: true,
      remaining: 19,
      limit: 20,
      logId: "log-1",
    });
    mockGenerateRecipes.mockResolvedValue({
      success: true,
      recipes: SAMPLE_RECIPES,
    });
    mockReleaseGenerationSlot.mockResolvedValue(undefined);
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
    // The rate-limit slot was reserved before the AI call, and a
    // successful generation should not roll it back.
    expect(mockReserveGenerationSlot).toHaveBeenCalledWith("user-1");
    expect(mockReleaseGenerationSlot).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(401);
    expect(mockGenerateRecipes).not.toHaveBeenCalled();
    expect(mockReserveGenerationSlot).not.toHaveBeenCalled();
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
    expect(mockReserveGenerationSlot).not.toHaveBeenCalled();
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
    mockReserveGenerationSlot.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 20,
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(429);
    expect(mockGenerateRecipes).not.toHaveBeenCalled();
    expect(mockReleaseGenerationSlot).not.toHaveBeenCalled();
  });

  it("returns 429 when the reservation is rejected due to a concurrent conflict (fail closed)", async () => {
    // reserveGenerationSlot fails closed internally on a Postgres
    // serialization failure from a racing concurrent transaction, so from
    // the route's perspective this just looks like `allowed: false`.
    mockReserveGenerationSlot.mockResolvedValue({
      allowed: false,
      remaining: 0,
      limit: 20,
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(429);
    expect(mockGenerateRecipes).not.toHaveBeenCalled();
  });

  it("returns 502 with a clean error (not a crash) when the AI call fails, and releases the reserved slot", async () => {
    mockGenerateRecipes.mockResolvedValue({
      success: false,
      error: "AI recipe generation service returned malformed JSON.",
    });

    const response = await POST(makeRequest(VALID_BODY));

    expect(response.status).toBe(502);
    const json = await response.json();
    expect(json.error).toMatch(/malformed JSON/i);
    // The slot was reserved before the AI call (to close the race), so a
    // failed generation must explicitly roll it back to avoid burning the
    // user's daily cap on a failed attempt.
    expect(mockReleaseGenerationSlot).toHaveBeenCalledWith("log-1");
  });
});
