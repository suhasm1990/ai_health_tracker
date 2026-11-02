export type LlmProvider = "nvidia" | "google" | "openai" | "custom" | "mock";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  /** Optional quicker model for the first turn, which only picks tools; `model` writes the answer. */
  fastModel?: string;
  /** Provider-specific request fields, e.g. switching off a reasoning model's thinking phase. */
  requestOptions?: Record<string, unknown>;
  /** Chat-completions endpoint for OpenAI-compatible providers. */
  baseUrl?: string;
}

const ENDPOINTS: Partial<Record<LlmProvider, string>> = {
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

const DEFAULT_MODELS: Partial<Record<LlmProvider, string>> = {
  nvidia: "nvidia/nemotron-3-ultra-550b-a55b",
  google: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
};

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  nvidia: "NVIDIA NIM",
  google: "Google Gemini",
  openai: "OpenAI",
  custom: "LLM",
  mock: "Sandbox Health Advisor",
};

/**
 * NVIDIA's Nemotron models think before answering by default, which took ~21s per answer versus
 * ~5s with thinking off and no loss of accuracy on health summaries, so it is switched off.
 */
const NVIDIA_OPTIONS = { chat_template_kwargs: { enable_thinking: false } };

export const MOCK_CONFIG: LlmConfig = { provider: "mock", apiKey: "", model: "sandbox-advisor" };

/**
 * Provider selection is server-side only (environment variables), in priority order:
 * NVIDIA NIM, Google Gemini, generic LLM_* variables, OpenAI, then the offline advisor.
 */
export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  if (env.NVIDIA_API_KEY) {
    return {
      provider: "nvidia",
      apiKey: env.NVIDIA_API_KEY,
      model: env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia!,
      fastModel: env.NVIDIA_FAST_MODEL || undefined,
      requestOptions: NVIDIA_OPTIONS,
      baseUrl: env.NVIDIA_BASE_URL || ENDPOINTS.nvidia,
    };
  }
  const geminiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (geminiKey) {
    return { provider: "google", apiKey: geminiKey, model: env.GEMINI_MODEL || env.GOOGLE_MODEL || DEFAULT_MODELS.google! };
  }
  if (env.LLM_API_KEY) {
    const provider = (env.LLM_PROVIDER as LlmProvider) || "nvidia";
    return {
      provider,
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL || DEFAULT_MODELS[provider] || DEFAULT_MODELS.nvidia!,
      fastModel: env.LLM_FAST_MODEL || undefined,
      requestOptions: provider === "nvidia" ? NVIDIA_OPTIONS : undefined,
      baseUrl: env.LLM_BASE_URL || ENDPOINTS[provider],
    };
  }
  if (env.OPENAI_API_KEY) {
    return { provider: "openai", apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || DEFAULT_MODELS.openai!, baseUrl: ENDPOINTS.openai };
  }
  return MOCK_CONFIG;
}
