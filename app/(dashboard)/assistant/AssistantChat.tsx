"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

const EXAMPLE_QUESTIONS = [
  "What can I cook in under 30 minutes from my saved recipes?",
  "What's substitutable for egg in one of my recipes?",
  "What's on my meal plan this week?",
];

/** Extracts a human-readable error message from a JSON error body, if present. */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}

/** Narrow runtime check for the `{ reply: string }` body POST /api/assistant returns. */
function isReplyResponse(value: unknown): value is { reply: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.reply === "string" && candidate.reply.length > 0;
}

/**
 * Chat interface for the cooking assistant. Conversation history lives
 * only in this component's state — nothing is persisted server-side, so a
 * page refresh clears it (an intentional scope decision, not a bug).
 * Every send resends the full history so far plus the new message; the
 * server has no memory of its own between requests.
 */
export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSubmitting]);

  async function sendMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    setError(null);
    const historyBeforeSend = messages;
    const nextMessages: ChatMessage[] = [
      ...historyBeforeSend,
      { role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setInput("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: historyBeforeSend }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          extractErrorMessage(
            body,
            "Failed to reach the assistant. Please try again.",
          ),
        );
        return;
      }

      if (!isReplyResponse(body)) {
        setError(
          "Received an unexpected response from the assistant. Please try again.",
        );
        return;
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: body.reply },
      ]);
    } catch {
      setError("Failed to reach the assistant. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleRetry() {
    // Retry the last user message: pop the assistant's turn never
    // happened, so the last entry in `messages` is already the user turn
    // that failed — just resend it as-is.
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMessage) {
      return;
    }
    const historyWithoutLast = messages.slice(0, -1);
    setError(null);
    setMessages(historyWithoutLast);
    void sendMessage(lastUserMessage.content);
  }

  return (
    <div className="flex flex-col rounded-card border border-border bg-surface shadow-sm">
      <div className="flex max-h-[28rem] min-h-[16rem] flex-col gap-3 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <span className="text-2xl" aria-hidden="true">
              👩‍🍳
            </span>
            <p className="text-sm text-muted">
              Ask me anything about your saved recipes or this week&apos;s meal
              plan.
            </p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLE_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void sendMessage(question)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-foreground transition-colors duration-200 ease-out-quart hover:bg-surface-2"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-card px-4 py-2.5 text-sm whitespace-pre-line ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-foreground"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {isSubmitting && (
          <div
            role="status"
            className="flex items-center gap-2 text-sm text-muted"
          >
            <svg
              className="h-4 w-4 animate-spin text-primary"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Thinking…</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-col items-start gap-2 rounded-card border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="rounded-control border border-danger/40 px-3 py-1 text-xs font-medium text-danger transition-colors duration-200 ease-out-quart hover:bg-danger/10"
            >
              Try again
            </button>
          </div>
        )}

        <div ref={listEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-border p-3"
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message
        </label>
        <input
          id="assistant-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isSubmitting}
          placeholder="Ask about your recipes or meal plan…"
          className="flex-1 rounded-control border border-border bg-background px-3 py-2.5 text-foreground transition-colors duration-200 ease-out-quart focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isSubmitting || input.trim().length === 0}
          className="inline-flex items-center justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
