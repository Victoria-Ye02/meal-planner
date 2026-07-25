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

  it("sends the tools array when provided", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: { content: "ok" } }] }),
    );
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "assign_recipe_to_meal_plan",
          description: "desc",
          parameters: { type: "object", properties: {} },
        },
      },
    ];

    await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools,
    });

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const requestBody = JSON.parse(call[1].body);
    expect(requestBody.tools).toEqual(tools);
  });

  it("does not include a tools key when none is provided", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({ choices: [{ message: { content: "ok" } }] }),
    );

    await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const requestBody = JSON.parse(call[1].body);
    expect(requestBody.tools).toBeUndefined();
  });

  it("returns requested tool calls (parsed to a clean shape) when the model responds with tool_calls instead of text", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "assign_recipe_to_meal_plan",
                    arguments:
                      '{"recipeId":"r1","dayOfWeek":0,"mealType":"dinner"}',
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "yes, assign it" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.toolCalls).toEqual([
        {
          id: "call_123",
          name: "assign_recipe_to_meal_plan",
          argumentsJson: '{"recipeId":"r1","dayOfWeek":0,"mealType":"dinner"}',
        },
      ]);
      expect(result.reply).toBe("");
    }
  });

  it("returns an empty toolCalls array for a plain text reply", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({
        choices: [{ message: { content: "just text" } }],
      }),
    );

    const result = await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.toolCalls).toEqual([]);
      expect(result.reply).toBe("just text");
    }
  });

  it("builds the correct follow-up message sequence (assistant tool_calls turn + tool result turn) when toolResult is provided", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockFetchResponse({
        choices: [{ message: { content: "Done! Assigned it." } }],
      }),
    );

    const result = await askAssistant({
      systemPrompt: "sys",
      messages: [{ role: "user", content: "yes, assign it" }],
      toolResult: {
        call: {
          id: "call_123",
          name: "assign_recipe_to_meal_plan",
          argumentsJson: '{"recipeId":"r1","dayOfWeek":0,"mealType":"dinner"}',
        },
        resultContent: '{"success":true,"recipeTitle":"Garlic Pasta"}',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reply).toBe("Done! Assigned it.");
    }

    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const requestBody = JSON.parse(call[1].body);
    // system, user, assistant-with-tool-calls, tool-result
    expect(requestBody.messages).toHaveLength(4);
    expect(requestBody.messages[2]).toEqual({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "assign_recipe_to_meal_plan",
            arguments: '{"recipeId":"r1","dayOfWeek":0,"mealType":"dinner"}',
          },
        },
      ],
    });
    expect(requestBody.messages[3]).toEqual({
      role: "tool",
      tool_call_id: "call_123",
      content: '{"success":true,"recipeTitle":"Garlic Pasta"}',
    });
  });
});
