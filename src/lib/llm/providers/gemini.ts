import { ChatMessage, LlmConfig, ToolExecutionSummary } from "../types";
import { HEALTH_TOOL_DEFINITIONS, executeHealthTool } from "../tools";

export async function runGeminiAgent(
  messages: ChatMessage[],
  config: LlmConfig,
  systemPrompt: string
): Promise<{ text: string; toolsCalled: ToolExecutionSummary[] }> {
  const modelName = config.model || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey}`;

  // Map our tool definitions to Gemini functionDeclarations
  const functionDeclarations = HEALTH_TOOL_DEFINITIONS.map((tool) => {
    // Convert property types to Gemini uppercase format
    const properties: Record<string, any> = {};
    for (const [key, prop] of Object.entries(tool.parameters.properties)) {
      properties[key] = {
        type: prop.type.toUpperCase(),
        description: prop.description,
      };
      if (prop.enum) {
        properties[key].enum = prop.enum;
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "OBJECT",
        properties,
        required: tool.parameters.required || [],
      },
    };
  });

  // Prepare initial contents from message history
  const contents: any[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: m.content }],
      });
    } else if (m.role === "assistant") {
      contents.push({
        role: "model",
        parts: [{ text: m.content }],
      });
    }
  }

  const toolsCalled: ToolExecutionSummary[] = [];
  const MAX_TURNS = 4;
  let turn = 0;

  while (turn < MAX_TURNS) {
    turn++;

    const requestBody: any = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      throw new Error("No candidate content received from Gemini model");
    }

    const parts = candidate.content.parts;
    const functionCalls = parts.filter((p: any) => p.functionCall);

    if (functionCalls.length > 0) {
      // Append model response with the functionCall
      contents.push({
        role: "model",
        parts,
      });

      // Execute each functionCall and append response
      const responseParts: any[] = [];
      for (const part of functionCalls) {
        const call = part.functionCall;
        const fnName = call.name;
        const fnArgs = call.args || {};

        try {
          const result = await executeHealthTool(fnName, fnArgs);
          toolsCalled.push(result.summary);

          responseParts.push({
            functionResponse: {
              name: fnName,
              response: { output: result.data },
            },
          });
        } catch (err: any) {
          responseParts.push({
            functionResponse: {
              name: fnName,
              response: { error: err.message || "Failed executing tool" },
            },
          });
        }
      }

      contents.push({
        role: "function",
        parts: responseParts,
      });

      continue;
    }

    // Text response reached
    const textPart = parts.find((p: any) => p.text);
    return {
      text: textPart?.text || "I have evaluated your health data.",
      toolsCalled,
    };
  }

  return {
    text: "I analyzed your health metrics, but reached the maximum reasoning steps.",
    toolsCalled,
  };
}
