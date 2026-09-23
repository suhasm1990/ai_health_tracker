import { PROVIDER_LABELS, resolveLlmConfig } from "./config";
import { runToolLoop, type AgentRun } from "./loop";
import { geminiAdapter } from "./providers/gemini";
import { runMockAdvisor } from "./providers/mock";
import { openAiAdapter } from "./providers/openai";
import type { ToolContext } from "./tools";

export type { ToolContext };
import type { AgentResponse, ChatMessage } from "./types";

const SYSTEM_PROMPT = `You are an AI Personal Health Coach for AI Health Tracker (Powered by Google Health API).

CRITICAL FORMATTING & BREVITY RULES:
1. BE COMPACT & CONCISE: The user explicitly requires short, compact, high-value responses. NEVER output long essays, generic boilerplate, or walls of text.
2. DIRECT METRICS FIRST: Answer the user's question immediately with the key numbers bolded (e.g. **7h 23m sleep**, **Score: 88/100**, **8,450 steps**, **58 bpm**).
3. BULLET-POINT STRUCTURE: Present the key insights in 2 to 4 compact, high-impact bullet points maximum.
4. ACTIONABLE TAKEAWAY: End with a single, concrete, 1-line recommendation.
5. NO FLUFF: Skip conversational filler ("Hello! I would be glad to help..."). Keep any medical disclaimer to at most 1 short line only when diagnostic advice is touched.

TOOL CALLING:
- NEVER invent or guess metrics. If a tool returns null for a value, say it was not recorded. ALWAYS use your provided tools:
  - Today's summary, steps, calories, active minutes, weight, SpO2 -> 'get_today_health_summary'
  - Sleep quality, duration, score, sleep stages -> 'get_sleep_analysis'
  - Heart rate, resting HR, cardio zones -> 'get_heart_rate_insights'
  - Weekly trends, 7-day averages -> 'get_weekly_trends'
  - Connected devices, battery status -> 'get_connected_devices'`;

const MOCK_MODEL = "google-health-agent";

const toResponse = (run: AgentRun, provider: string, model: string): AgentResponse => ({
  message: { role: "assistant", content: run.text },
  toolsCalled: run.toolsCalled,
  provider,
  model,
});

/** Answers with the configured provider, falling back to the offline advisor on any provider failure. */
export async function runHealthAgent(messages: ChatMessage[], ctx: ToolContext): Promise<AgentResponse> {
  const config = resolveLlmConfig();
  if (!config.apiKey) return toResponse(await runMockAdvisor(messages, ctx), PROVIDER_LABELS.mock, MOCK_MODEL);

  try {
    const adapter = config.provider === "google" ? geminiAdapter(messages, config, SYSTEM_PROMPT) : openAiAdapter(messages, config, SYSTEM_PROMPT);
    return toResponse(await runToolLoop(adapter, ctx), PROVIDER_LABELS[config.provider] ?? "LLM", config.model);
  } catch (err) {
    console.error("Agent execution error, falling back to offline advisor:", err);
    const fallback = await runMockAdvisor(messages, ctx);
    const reason = err instanceof Error ? err.message : "Unknown error";
    return toResponse(
      { ...fallback, text: `> ⚠️ **Provider Notice**: Reverted to the local advisor because the ${config.provider} call failed: *${reason}*.\n\n${fallback.text}` },
      "Local Health Advisor (Fallback)",
      MOCK_MODEL
    );
  }
}
