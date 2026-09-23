import type { LlmConfig } from "../config";
import { callProvider, type ProviderAdapter, type ToolCall } from "../loop";
import { HEALTH_TOOLS } from "../tools";
import type { ChatMessage } from "../types";

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments?: string };
}

type OpenAiMessage =
  | { role: "system" | "user" | "assistant"; content: string; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

interface OpenAiResponse {
  choices?: { message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }[];
}

const tools = HEALTH_TOOLS.map((tool) => ({ type: "function", function: tool }));

const parseArgs = (json?: string): Record<string, unknown> => {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
};

/** Works with OpenAI, NVIDIA NIM and any other chat-completions compatible endpoint. */
export function openAiAdapter(messages: ChatMessage[], config: LlmConfig, systemPrompt: string): ProviderAdapter {
  if (!config.baseUrl) throw new Error(`No endpoint configured for provider "${config.provider}" (set LLM_BASE_URL).`);
  const url = config.baseUrl;
  const conversation: OpenAiMessage[] = [{ role: "system", content: systemPrompt }, ...messages];

  return {
    async complete() {
      const data = await callProvider<OpenAiResponse>(`LLM provider (${config.provider})`, url, {
        model: config.model,
        messages: conversation,
        tools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1024,
      }, { Authorization: `Bearer ${config.apiKey}` });

      const message = data.choices?.[0]?.message;
      if (!message) throw new Error("No response choices returned by model");
      const rawCalls = message.tool_calls ?? [];
      conversation.push({ role: "assistant", content: message.content ?? "", ...(rawCalls.length ? { tool_calls: rawCalls } : {}) });
      const toolCalls: ToolCall[] = rawCalls.map((c) => ({ id: c.id, name: c.function.name, args: parseArgs(c.function.arguments) }));
      return { text: message.content ?? null, toolCalls };
    },
    addToolResults(results) {
      for (const { call, output } of results) {
        conversation.push({ role: "tool", tool_call_id: call.id, name: call.name, content: JSON.stringify(output) });
      }
    },
  };
}
