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

/** A model the user can pick in the chat. Only free-tier models are listed for now. */
export interface ModelOption {
  id: string;
  label: string;
  provider: LlmProvider;
  /** Model ID sent to the provider. */
  model: string;
  /** False when the server has no API key for this provider, so it cannot be picked. */
  available: boolean;
}

/**
 * The free models offered in the chat's model picker. The client only ever sends an `id` from this
 * list; keys, endpoints and model IDs stay on the server.
 */
export function listFreeModels(env: NodeJS.ProcessEnv = process.env): ModelOption[] {
  const geminiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  return [
    {
      id: "nemotron-ultra",
      label: "NVIDIA Nemotron 3 Ultra",
      provider: "nvidia",
      model: env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia!,
      available: Boolean(env.NVIDIA_API_KEY),
    },
    {
      id: "gemini-4-hydrogen",
      label: "Gemini 4 Hydrogen",
      provider: "google",
      model: GEMINI_HYDROGEN_MODEL,
      available: Boolean(geminiKey),
    },
  ];
}

/** Gemini 4 Hydrogen's API model ID on the Gemini Developer API (free tier with an AI Studio key). */
const GEMINI_HYDROGEN_MODEL = "gemini-4-hydrogen";

/** The config for a model picked in the chat, or null when the ID is unknown or its key is missing. */
function configForOption(id: string, env: NodeJS.ProcessEnv): LlmConfig | null {
  const option = listFreeModels(env).find((m) => m.id === id && m.available);
  if (!option) return null;
  if (option.provider === "nvidia") {
    return {
      provider: "nvidia",
      apiKey: env.NVIDIA_API_KEY!,
      model: option.model,
      fastModel: env.NVIDIA_FAST_MODEL || undefined,
      requestOptions: NVIDIA_OPTIONS,
      baseUrl: env.NVIDIA_BASE_URL || ENDPOINTS.nvidia,
    };
  }
  return { provider: "google", apiKey: (env.GEMINI_API_KEY || env.GOOGLE_API_KEY)!, model: option.model };
}

/** The picker entry matching a resolved config, so the UI can show which model is active. */
export function selectedModelId(config: LlmConfig, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return listFreeModels(env).find((m) => m.available && m.provider === config.provider && m.model === config.model)?.id;
}

/**
 * Provider selection is server-side (environment variables). A model picked in the chat (`modelId`)
 * wins when it is a known free model whose key is set; otherwise, in priority order:
 * NVIDIA NIM, Google Gemini, generic LLM_* variables, OpenAI, then the offline advisor.
 */
export function resolveLlmConfig(env: NodeJS.ProcessEnv = process.env, modelId?: string): LlmConfig {
  const picked = modelId ? configForOption(modelId, env) : null;
  if (picked) return picked;
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
