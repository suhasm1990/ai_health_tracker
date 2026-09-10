import { ChatMessage, LlmConfig, AgentResponse, LlmProviderType } from "./types";
import { runOpenAICompatibleAgent } from "./providers/openaiCompatible";
import { runGeminiAgent } from "./providers/gemini";
import { runMockAdvisor } from "./providers/mockAdvisor";

const CLINICAL_WELLNESS_SYSTEM_PROMPT = `You are an AI Personal Health Coach for AI Health Tracker (Powered by Google Health API).
You assist the user by analyzing their physiological and wellness metrics collected from Google Health API and connected wearables (e.g. Fitbit Air, Pixel Watch).

IMPORTANT INSTRUCTIONS:
1. NEVER guess or invent user metrics. ALWAYS use your provided tools to look up the user's data when asked about:
   - Today's summary, steps, calories, active zone minutes, weight, or SpO2 -> use 'get_today_health_summary'
   - Sleep quality, duration, sleep score, sleep stages (Deep, REM, Light, Awake), or sleep hygiene -> use 'get_sleep_analysis'
   - Heart rate, resting HR, cardio zones, or intraday readings -> use 'get_heart_rate_insights'
   - Weekly trends, 7-day averages, or consistency -> use 'get_weekly_trends'
   - Connected devices, tracker battery level, or sync status -> use 'get_connected_devices'
2. When answering sleep questions:
   - State the exact duration (e.g., 7h 23m) and sleep score (e.g., 88/100).
   - Detail the percentage of Deep and REM sleep, explaining what they mean for physical and cognitive restoration.
   - Provide concrete, evidence-based recommendations for improving sleep (e.g., bedroom temperature 65-68°F, avoiding blue light 1 hour prior, consistent wake times, limiting caffeine 8 hours before bed).
3. Be encouraging, empathetic, structured, and clinically sound.
4. Format responses cleanly using Markdown headers, bullet points, and bold metrics.
5. Conclude with a brief standard wellness disclaimer when giving advice ("*Consult with a certified healthcare provider for medical diagnosis.*").`;

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
