import { z } from "zod";

/**
 * Request body shape for POST /api/assistant. `history` is the prior
 * conversation turns from this browser session only — chat history is
 * never persisted server-side (no new schema for this feature), so the
 * client resends it with every message and the server treats each request
 * as stateless.
 */
export const assistantChatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(2000, "Message is too long (max 2000 characters)."),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .max(50, "Conversation history is too long.")
    .default([]),
});

export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;
