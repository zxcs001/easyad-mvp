import type { ChatMessage } from "../types";

/**
 * Single integration point for the site assistant.
 *
 * Today it returns a static "Hello world" reply so the chat UI works end to end
 * without any model. To connect a real LLM later, replace the body below with a
 * provider call (e.g. the Anthropic API) — the signature already receives the
 * full conversation `history` and returns the `ChatMessage` shape the API route
 * and UI expect, so nothing else needs to change.
 *
 * Example future implementation (Anthropic SDK, claude-opus-4-8):
 *
 *   import Anthropic from "@anthropic-ai/sdk";
 *   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
 *   const response = await client.messages.create({
 *     model: "claude-opus-4-8",
 *     max_tokens: 1024,
 *     system: SYSTEM_PROMPT,
 *     messages: history.map((m) => ({ role: m.role, content: m.content })),
 *   });
 *   return { role: "assistant", content: textFrom(response) };
 */
export async function generateChatReply(history: ChatMessage[]): Promise<ChatMessage> {
  // `history` is intentionally unused for now; it is the context a future model
  // would condition on. Referenced here so the contract stays stable.
  void history;
  return { role: "assistant", content: "Hello world" };
}

// Optional system prompt scaffold for when a model is connected.
export const SYSTEM_PROMPT =
  "You are the OOH Market assistant. Help advertisers, operators, and institutions " +
  "discover inventory, book campaigns, submit creative, and understand reporting. " +
  "Be concise and never invent campaign, billing, or account data.";
