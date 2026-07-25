import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateEmbedding } from "../../lib/ai/embeddings";

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

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the embedding vector from a well-formed mocked response", async () => {
    const vector = Array.from({ length: 1536 }, (_, i) => i / 1536);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({
        data: [{ embedding: vector }],
      }),
    );

    const result = await generateEmbedding("garlic pasta with parmesan");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.embedding).toHaveLength(1536);
      expect(result.embedding[1]).toBeCloseTo(1 / 1536);
    }
  });

  it("calls the OpenRouter embeddings endpoint with the text-embedding-3-small model", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ data: [{ embedding: [0.1] }] }),
    );

    await generateEmbedding("chicken soup");

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://openrouter.ai/api/v1/embeddings");
    const requestBody = JSON.parse(call[1].body);
    expect(requestBody.model).toBe("text-embedding-3-small");
    expect(requestBody.input).toBe("chicken soup");
  });

  it("returns a graceful typed error, not a throw, on a malformed response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ data: [] }),
    );

    const result = await generateEmbedding("something");

    expect(result.success).toBe(false);
  });

  it("returns a graceful typed error on a network failure", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down"),
    );

    const result = await generateEmbedding("something");

    expect(result.success).toBe(false);
  });

  it("returns a graceful typed error on a non-2xx response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({}, { ok: false, status: 500 }),
    );

    const result = await generateEmbedding("something");

    expect(result.success).toBe(false);
  });

  it("returns a graceful typed error when OPENROUTER_API_KEY is missing, without leaking the key value", async () => {
    vi.unstubAllEnvs();

    const result = await generateEmbedding("something");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain("test-api-key");
    }
  });
});
