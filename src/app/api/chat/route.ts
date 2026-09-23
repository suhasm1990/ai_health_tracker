import { errorResponse, json } from "@/lib/http";
import { runHealthAgent } from "@/lib/llm/agent";
import type { ChatMessage } from "@/lib/llm/types";

const MAX_MESSAGES = 40;
const MAX_CONTENT_CHARS = 4000;

/** Accepts only user/assistant turns with string content; provider configuration is never taken from the client. */
function parseMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_MESSAGES) return null;
  const messages: ChatMessage[] = [];
  for (const m of input) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    if (!role || typeof m.content !== "string") return null;
    messages.push({ role, content: m.content.slice(0, MAX_CONTENT_CHARS) });
  }
  return messages;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const messages = parseMessages(body?.messages);
  if (!messages) return json({ error: "Body must contain a non-empty 'messages' array of user/assistant turns" }, 400);

  try {
    return json(await runHealthAgent(messages));
  } catch (err) {
    return errorResponse(err, "Failed to process chat message");
  }
}
