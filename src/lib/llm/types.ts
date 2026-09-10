export type LlmProviderType = "nvidia" | "google" | "openai" | "custom" | "mock" | "auto";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallPayload[];
}

export interface ToolCallPayload {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface LlmConfig {
  provider: LlmProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface ToolExecutionSummary {
  name: string;
  label: string;
  args?: any;
  resultSummary?: string;
}

export interface AgentResponse {
  message: {
    role: "assistant";
    content: string;
  };
  toolsCalled: ToolExecutionSummary[];
  provider: string;
  model: string;
}
