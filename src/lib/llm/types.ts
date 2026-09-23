export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean";
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolExecutionSummary {
  name: string;
  label: string;
  args?: Record<string, unknown>;
  resultSummary?: string;
}

export interface AgentResponse {
  message: { role: "assistant"; content: string };
  toolsCalled: ToolExecutionSummary[];
  provider: string;
  model: string;
}
