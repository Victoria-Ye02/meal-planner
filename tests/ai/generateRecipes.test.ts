import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateRecipes } from "../../lib/ai/generateRecipes";

function mockFetchResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number },
) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

describe("generateRecipes", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses a well-formed mocked AI response into typed Recipe[]", async () => {
    const aiContent = JSON.stringify({
      recipes: [
        {
          title: "Garlic Butter Pasta",
          ingredients: ["pasta", "garlic", "butter", "parmesan"],
          instructions:
            "1. Boil pasta. 2. Saute garlic in butter. 3. Toss together.",
        },
        {
          title: "Veggie Stir Fry",
          ingredients: ["broccoli", "carrot", "soy sauce", "rice"],
          instructions:
            "1. Cook rice. 2. Stir fry vegetables. 3. Add soy sauce and combine.",
        },
      ],
    });

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({
        choices: [{ message: { content: aiContent } }],
      }),
    );

    const result = await generateRecipes({
      ingredients: ["pasta", "garlic", "butter"],
      preferences: ["vegetarian"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.recipes).toHaveLength(2);
      expect(result.recipes[0]).toEqual({
        title: "Garlic Butter Pasta",
        ingredients: ["pasta", "garlic", "butter", "parmesan"],
        instructions:
          "1. Boil pasta. 2. Saute garlic in butter. 3. Toss together.",
      });
    }

    // Verify the request was sent to OpenRouter with the API key as a Bearer token,
    // and that raw user input was embedded in a delimited data block, not the
    // instruction text.
    const [url, requestInit] = (fetch as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(requestInit.headers.Authorization).toBe("Bearer test-api-key");
    const sentBody = JSON.parse(requestInit.body);
    expect(sentBody.messages[1].content).toContain("User-provided ingredients");
    expect(sentBody.messages[1].content).toContain('"pasta"');
  });

  it("gracefully handles a response wrapped in markdown code fences", async () => {
    const fenced =
      "```json\n" +
      JSON.stringify({
        recipes: [
          {
            title: "Toast",
            ingredients: ["bread"],
            instructions: "Toast the bread.",
          },
        ],
      }) +
      "\n```";

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: { content: fenced } }] }),
    );

    const result = await generateRecipes({
      ingredients: ["bread"],
      preferences: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.recipes[0].title).toBe("Toast");
    }
  });

  it("returns a typed error (not a throw) when the AI content is malformed JSON", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({
        choices: [{ message: { content: "this is not valid JSON {{{" } }],
      }),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns a typed error when the AI JSON fails schema validation", async () => {
    // Missing required "instructions" field, and "ingredients" is not an array.
    const invalidShape = JSON.stringify({
      recipes: [{ title: "Broken Recipe", ingredients: "not-an-array" }],
    });

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: { content: invalidShape } }] }),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unexpected response shape/i);
    }
  });

  it("returns a typed error when the recipes array is empty", async () => {
    const emptyRecipes = JSON.stringify({ recipes: [] });

    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: { content: emptyRecipes } }] }),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
  });

  it("returns a typed error when the response body can't be parsed as JSON at all", async () => {
    // Distinct from "malformed JSON in the AI's `content` string" below:
    // this is the outer HTTP response body itself failing `response.json()`
    // (e.g. OpenRouter returning a 200 with a non-JSON body).
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token in JSON");
      },
    } as unknown as Response);

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unreadable response/i);
    }
  });

  it("returns a typed error when the response has no message content", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: {} }] }),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/no content/i);
    }
  });

  it("returns a typed error when choices is missing entirely", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({}),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/no content/i);
    }
  });

  it("returns a typed error on a non-2xx HTTP response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ error: "rate limited" }, { ok: false, status: 429 }),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/429/);
    }
  });

  it("returns a typed error on a network failure (fetch rejects)", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down"),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns a typed error on an abort/timeout", async () => {
    const abortError = new Error("The operation was aborted.");
    abortError.name = "AbortError";
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      abortError,
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/timed out/i);
    }
  });

  it("returns a typed error when OPENROUTER_API_KEY is not configured", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain("test-api-key");
    }
    // No network call should have been attempted without a key.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never includes the API key in a returned error message", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ error: "server error" }, { ok: false, status: 500 }),
    );

    const result = await generateRecipes({
      ingredients: ["egg"],
      preferences: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain("test-api-key");
    }
  });
});
