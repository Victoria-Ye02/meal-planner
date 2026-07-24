import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { askAssistant } from "../../lib/ai/chatAssistant";

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

describe("askAssistant", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-api-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the assistant's reply text from a well-formed mocked response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({
        choices: [
          {
            message: {
              content: "You can swap the egg for 1/4 cup applesauce.",
            },
          },
        ],
      }),
    );

    const result = await askAssistant({
      systemPrompt: "You are a cooking assistant.",
      messages: [{ role: "user", content: "What can I use instead of egg?" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reply).toBe("You can swap the egg for 1/4 cup applesauce.");
    }
  });

  it("sends the system prompt and full message history to the API", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: { content: "ok" } }] }),
    );

    await askAssistant({
      systemPrompt: "SYSTEM_PROMPT_MARKER",
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second question" },
      ],
    });

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const requestBody = JSON.parse(call[1].body);
    expect(requestBody.messages[0]).toEqual({
      role: "system",
      content: "SYSTEM_PROMPT_MARKER",
    });
    expect(requestBody.messages).toHaveLength(4);
    expect(requestBody.messages[3]).toEqual({
      role: "user",
      content: "second question",
    });
  });

  it("returns a graceful typed error, not a throw, on a malformed/missing content response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: {} }] }),
    );

    const result = await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it("returns a graceful typed error on a network failure", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down"),
    );

    const result = await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.success).toBe(false);
  });

  it("returns a graceful typed error on a non-2xx response", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({}, { ok: false, status: 500 }),
    );

    const result = await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.success).toBe(false);
  });

  it("returns a graceful typed error when OPENROUTER_API_KEY is missing, without leaking the key value", async () => {
    vi.unstubAllEnvs();

    const result = await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain("test-api-key");
    }
  });
});
