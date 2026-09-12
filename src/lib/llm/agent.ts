import { ChatMessage, LlmConfig, AgentResponse, LlmProviderType } from "./types";
import { runOpenAICompatibleAgent } from "./providers/openaiCompatible";
import { runGeminiAgent } from "./providers/gemini";
import { runMockAdvisor } from "./providers/mockAdvisor";

const CLINICAL_WELLNESS_SYSTEM_PROMPT = `You are an AI Personal Health Coach for AI Health Tracker (Powered by Google Health API).

CRITICAL FORMATTING & BREVITY RULES:
1. BE COMPACT & CONCISE: The user explicitly requires short, compact, high-value responses. NEVER output long essays, generic boilerplate, or walls of text.
2. DIRECT METRICS FIRST: Answer the user's question immediately with the key numbers bolded (e.g. **7h 23m sleep**, **Score: 88/100**, **8,450 steps**, **58 bpm**).
3. BULLET-POINT STRUCTURE: Present the key insights in 2 to 4 compact, high-impact bullet points maximum.
4. ACTIONABLE TAKEAWAY: End with a single, concrete, 1-line recommendation.
5. NO FLUFF: Skip conversational filler ("Hello! I would be glad to help..."). Keep any medical disclaimer to at most 1 short line only when diagnostic advice is touched.

TOOL CALLING:
- NEVER invent or guess metrics. ALWAYS use your provided tools:
  - Today's summary, steps, calories, active minutes, weight, SpO2 -> 'get_today_health_summary'
  - Sleep quality, duration, score, sleep stages -> 'get_sleep_analysis'
  - Heart rate, resting HR, cardio zones -> 'get_heart_rate_insights'
  - Weekly trends, 7-day averages -> 'get_weekly_trends'
  - Connected devices, battery status -> 'get_connected_devices'`;

export function resolveLlmConfig(override?: Partial<LlmConfig>): LlmConfig {
  // 1. Explicit override from request
  if (override?.apiKey) {
    return {
      provider: override.provider || "auto",
      apiKey: override.apiKey,
      model: override.model || "meta/llama-3.3-70b-instruct",
      baseUrl: override.baseUrl,
    };
  }

  // 2. Environment variables: NVIDIA NIM
  if (process.env.NVIDIA_API_KEY) {
    return {
      provider: "nvidia",
      apiKey: process.env.NVIDIA_API_KEY,
      model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
      baseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1/chat/completions",
    };
  }

  // 4. Environment variables: Google Gemini
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    return {
      provider: "google",
      apiKey: key,
      model: process.env.GEMINI_MODEL || process.env.GOOGLE_MODEL || "gemini-2.5-flash",
    };
  }

  // 5. Environment variables: Generic LLM_API_KEY
  if (process.env.LLM_API_KEY) {
    const prov = (process.env.LLM_PROVIDER as LlmProviderType) || "nvidia";
    return {
      provider: prov,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL || "meta/llama-3.3-70b-instruct",
      baseUrl: process.env.LLM_BASE_URL,
    };
  }

  // 6. Environment variables: OpenAI
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }

  // 7. Fallback to mock advisor
  return {
    provider: "mock",
    apiKey: "",
    model: "sandbox-advisor",
  };
}

export async function runHealthAgent(
  messages: ChatMessage[],
  configOverride?: Partial<LlmConfig>
): Promise<AgentResponse> {
  const config = resolveLlmConfig(configOverride);

  // If no API key is available, use the intelligent fallback advisor
  if (config.provider === "mock" || !config.apiKey) {
    const mockResult = await runMockAdvisor(messages);
    return {
      message: {
        role: "assistant",
        content: mockResult.text,
      },
      toolsCalled: mockResult.toolsCalled,
      provider: "Sandbox Health Advisor",
      model: "google-health-agent",
    };
  }

  // Auto-detect provider if needed
  let effectiveProvider = config.provider;
  if (effectiveProvider === "auto") {
    if (config.apiKey.startsWith("nvapi-")) {
      effectiveProvider = "nvidia";
    } else if (config.apiKey.startsWith("AIzaSy")) {
      effectiveProvider = "google";
    } else if (config.apiKey.startsWith("sk-")) {
      effectiveProvider = "openai";
    } else {
      effectiveProvider = "nvidia";
    }
  }

  try {
    if (effectiveProvider === "google") {
      const result = await runGeminiAgent(messages, config, CLINICAL_WELLNESS_SYSTEM_PROMPT);
      return {
        message: {
          role: "assistant",
          content: result.text,
        },
        toolsCalled: result.toolsCalled,
        provider: "Google Gemini",
        model: config.model,
      };
    } else {
      // NVIDIA NIM, OpenAI, or custom OpenAI-compatible
      const result = await runOpenAICompatibleAgent(messages, config, CLINICAL_WELLNESS_SYSTEM_PROMPT);
      const providerLabel = effectiveProvider === "nvidia" ? "NVIDIA NIM" : effectiveProvider === "openai" ? "OpenAI" : "LLM";
      return {
        message: {
          role: "assistant",
          content: result.text,
        },
        toolsCalled: result.toolsCalled,
        provider: providerLabel,
        model: config.model,
      };
    }
  } catch (err: any) {
    console.error("Agent execution error, falling back to mock advisor:", err);
    const fallback = await runMockAdvisor(messages);
    return {
      message: {
        role: "assistant",
        content: `> ⚠️ **Provider Notice**: Reverted to Local Advisor because ${effectiveProvider} call failed: *${err.message || "Unknown error"}*.\n\n${fallback.text}`,
      },
      toolsCalled: fallback.toolsCalled,
      provider: "Local Health Advisor (Fallback)",
      model: "google-health-agent",
    };
  }
}
