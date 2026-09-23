import { executeHealthTool, type ToolContext } from "./tools";
import type { ToolExecutionSummary } from "./types";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ModelTurn {
  text: string | null;
  toolCalls: ToolCall[];
}

export interface ToolOutcome {
  call: ToolCall;
  output: unknown;
}

/**
 * A provider owns its own conversation format; the loop only needs to know
 * how to ask for the next turn and how to hand tool results back.
 */
export interface ProviderAdapter {
  complete(): Promise<ModelTurn>;
  addToolResults(results: ToolOutcome[]): void;
}

export interface AgentRun {
  text: string;
  toolsCalled: ToolExecutionSummary[];
}

const MAX_TURNS = 4;
const DEFAULT_TEXT = "I have analyzed your health data.";
const MAX_TURNS_TEXT = "I analyzed your health metrics, but reached the maximum tool reasoning steps.";

/** Runs the model until it answers without tool calls, executing requested tools in parallel between turns. */
export async function runToolLoop(adapter: ProviderAdapter, ctx: ToolContext): Promise<AgentRun> {
  const toolsCalled: ToolExecutionSummary[] = [];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { text, toolCalls } = await adapter.complete();
    if (!toolCalls.length) return { text: text || DEFAULT_TEXT, toolsCalled };
    const results = await Promise.all(
      toolCalls.map(async (call): Promise<ToolOutcome> => {
        try {
          const result = await executeHealthTool(call.name, call.args, ctx);
          toolsCalled.push(result.summary);
          return { call, output: result.data };
        } catch (err) {
          return { call, output: { error: err instanceof Error ? err.message : "Failed executing tool" } };
        }
      })
    );
    adapter.addToolResults(results);
  }
  return { text: MAX_TURNS_TEXT, toolsCalled };
}

/** POSTs JSON to a provider and returns the parsed body, surfacing HTTP errors with their payload. */
export async function callProvider<T>(label: string, url: string, body: unknown, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${label} request failed (${res.status}): ${await res.text()}`);
  return res.json();
}
