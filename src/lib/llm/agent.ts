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

DATA ACCURACY:
- Read 'dataContext' first. Today's steps, calories and active minutes are running totals: judge them against the local hour, never as a finished day.
- If 'readingsFromEarlierDay' is set or 'syncedToday' is false, say which day the reading is from (or that the device has not synced today) instead of presenting it as today's.
- Compare against the user's own baseline when one is provided, rather than population norms. Only call a metric good or poor relative to that baseline (e.g. HRV at baseline is "steady", not "excellent").
- Quote numbers exactly as the tools return them; never paraphrase them into ranges such as "low-60s".
- You are not a doctor: do not diagnose. For readings outside normal ranges or sustained unusual changes, suggest checking with a healthcare provider.

TOOL CALLING:
- NEVER invent or guess metrics. If a tool returns null for a value, say it was not recorded. ALWAYS use your provided tools:
  - Today's summary, steps, calories, active minutes, weight, SpO2 -> 'get_today_health_summary'
  - Sleep quality, duration, score, sleep stages -> 'get_sleep_analysis'
  - Heart rate, resting HR, cardio zones -> 'get_heart_rate_insights'
  - Weekly trends, 7-day averages -> 'get_weekly_trends'
  - Last 4 weeks, monthly trends, "lately" -> 'get_long_term_trends'
  - Broad questions such as "how is my overall health?" or "how am I doing?" -> call BOTH 'get_today_health_summary' and 'get_long_term_trends' in the same turn, and weigh the multi-week trend above a single day
  - Connected devices, battery status -> 'get_connected_devices'`;

const MOCK_MODEL = "ai-health-tracker-agent";

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
