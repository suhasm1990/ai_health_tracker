import { ChatMessage, LlmConfig, ToolExecutionSummary } from "../types";
import { HEALTH_TOOL_DEFINITIONS, executeHealthTool } from "../tools";

export async function runOpenAICompatibleAgent(
  messages: ChatMessage[],
  config: LlmConfig,
  systemPrompt: string
): Promise<{ text: string; toolsCalled: ToolExecutionSummary[] }> {
  const endpoint = config.baseUrl || (config.provider === "nvidia" 
    ? "https://integrate.api.nvidia.com/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions");

  const toolsPayload = HEALTH_TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  const conversation: any[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => {
      const formatted: any = { role: m.role, content: m.content };
      if (m.name) formatted.name = m.name;
      if (m.tool_call_id) formatted.tool_call_id = m.tool_call_id;
      if (m.tool_calls) formatted.tool_calls = m.tool_calls;
      return formatted;
    }),
  ];

  const toolsCalled: ToolExecutionSummary[] = [];
  const MAX_TURNS = 4;
  let turn = 0;

  while (turn < MAX_TURNS) {
    turn++;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: conversation,
        tools: toolsPayload,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM provider (${config.provider}) request failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error("No response choices returned by model");
    }

    const assistantMsg = choice.message;

    // Check if tool calls were made
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      // Append assistant's tool-call message
      conversation.push({
        role: "assistant",
        content: assistantMsg.content || "",
        tool_calls: assistantMsg.tool_calls,
      });

      // Execute each tool call
      for (const call of assistantMsg.tool_calls) {
        const fnName = call.function.name;
        let fnArgs = {};
        try {
          fnArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          fnArgs = {};
        }

        try {
          const result = await executeHealthTool(fnName, fnArgs);
          toolsCalled.push(result.summary);

          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            name: fnName,
            content: JSON.stringify(result.data),
          });
        } catch (err: any) {
          conversation.push({
            role: "tool",
            tool_call_id: call.id,
            name: fnName,
            content: JSON.stringify({ error: err.message || "Failed executing tool" }),
          });
        }
      }
      // Continue to next turn with tools results populated in conversation
      continue;
    }

    // Model finished answering
    return {
      text: assistantMsg.content || "I have analyzed your health data.",
      toolsCalled,
    };
  }

  return {
    text: "I analyzed your health metrics, but reached the maximum tool reasoning steps.",
    toolsCalled,
  };
}
