import { NextRequest, NextResponse } from "next/server";
import type { ChatMessage, ChatRole } from "../../types";
import { generateChatReply } from "../../lib/chatbot";
import { isRateLimited } from "../../lib/rate-limit";

const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 4000;

export async function POST(request: NextRequest) {
  // Cheap abuse guard; tighten or make per-user once a paid model is wired in.
  if (isRateLimited(request, "chat", "global", 30, 60 * 1000)) {
    return NextResponse.json({ error: "Too many messages. Please slow down and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const messages = sanitizeMessages(body?.messages);
  if (!messages.length) {
    return NextResponse.json({ error: "A message is required" }, { status: 400 });
  }

  const reply = await generateChatReply(messages);
  return NextResponse.json({ message: reply });
}

function isRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant";
}

function sanitizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is ChatMessage => Boolean(entry) && isRole(entry.role) && typeof entry.content === "string" && entry.content.trim().length > 0)
    .slice(-MAX_MESSAGES)
    .map((entry) => ({ role: entry.role, content: entry.content.slice(0, MAX_CONTENT_LENGTH) }));
}
