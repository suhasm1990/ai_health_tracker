import type { LlmConfig } from "../config";
import { callProvider, type ProviderAdapter, type ToolCall } from "../loop";
import { HEALTH_TOOLS } from "../tools";
import type { ChatMessage } from "../types";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiContent {
  role: "user" | "model" | "function";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

const functionDeclarations = HEALTH_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: {
    type: "OBJECT",
    properties: Object.fromEntries(
      Object.entries(tool.parameters.properties).map(([key, p]) => [key, { ...p, type: p.type.toUpperCase() }])
    ),
    required: tool.parameters.required ?? [],
  },
}));

export function geminiAdapter(messages: ChatMessage[], config: LlmConfig, systemPrompt: string): ProviderAdapter {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`;
  const contents: GeminiContent[] = messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }));

  return {
    async complete() {
      const data = await callProvider<GeminiResponse>("Gemini API", url, {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ functionDeclarations }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }, { "x-goog-api-key": config.apiKey });

      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) throw new Error("No candidate content received from Gemini model");
      contents.push({ role: "model", parts });
      const toolCalls: ToolCall[] = parts
        .filter((p): p is Required<Pick<GeminiPart, "functionCall">> => Boolean(p.functionCall))
        .map((p, i) => ({ id: `${p.functionCall.name}-${i}`, name: p.functionCall.name, args: p.functionCall.args ?? {} }));
      return { text: parts.find((p) => p.text)?.text ?? null, toolCalls };
    },
    addToolResults(results) {
      contents.push({
        role: "function",
        parts: results.map(({ call, output }) => ({ functionResponse: { name: call.name, response: { output } } })),
      });
    },
  };
}
