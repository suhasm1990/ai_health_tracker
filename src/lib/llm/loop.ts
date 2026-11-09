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
/** "route" is the first turn, which only decides which tools to call; "answer" turns reason over the results. */
export type TurnStage = "route" | "answer";

export interface ProviderAdapter {
  complete(stage: TurnStage): Promise<ModelTurn>;
  addToolResults(results: ToolOutcome[]): void;
}

export interface AgentRun {
  text: string;
  toolsCalled: ToolExecutionSummary[];
}

const MAX_TURNS = 4;
/** A stalled provider call should fail with a clear error instead of hanging the chat. */
const PROVIDER_TIMEOUT_MS = 90_000;
/** Per-turn and per-tool timings in the server log: on in development, or anywhere with LLM_DEBUG=1. */
const DEBUG = process.env.LLM_DEBUG === "1" || process.env.NODE_ENV !== "production";
const log = (...parts: unknown[]) => DEBUG && console.log("[chat]", ...parts);
const DEFAULT_TEXT = "I have analyzed your health data.";
const MAX_TURNS_TEXT = "I analyzed your health metrics, but reached the maximum tool reasoning steps.";

/** Runs the model until it answers without tool calls, executing requested tools in parallel between turns. */
export async function runToolLoop(adapter: ProviderAdapter, ctx: ToolContext): Promise<AgentRun> {
  const toolsCalled: ToolExecutionSummary[] = [];
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const turnStart = Date.now();
    const { text, toolCalls } = await adapter.complete(turn === 0 ? "route" : "answer");
    log(`turn ${turn + 1} model ${Date.now() - turnStart}ms ->`, toolCalls.length ? toolCalls.map((c) => c.name).join(", ") : "answer");
    if (!toolCalls.length) return { text: text || DEFAULT_TEXT, toolsCalled };
    const results = await Promise.all(
      toolCalls.map(async (call): Promise<ToolOutcome> => {
        const toolStart = Date.now();
        try {
          const result = await executeHealthTool(call.name, call.args, ctx);
          log(`tool ${call.name} ${Date.now() - toolStart}ms, ${JSON.stringify(result.data).length} chars`);
          toolsCalled.push(result.summary);
          return { call, output: result.data };
        } catch (err) {
          log(`tool ${call.name} failed after ${Date.now() - toolStart}ms:`, err instanceof Error ? err.message : err);
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
  const payload = JSON.stringify(body);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: payload, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") throw new Error(`${label} did not respond within ${PROVIDER_TIMEOUT_MS / 1000}s`);
    throw err;
  }
  log(`${label} responded ${res.status} in ${Date.now() - started}ms, request ${payload.length} chars`);
  if (!res.ok) throw new Error(`${label} request failed (${res.status}): ${await res.text()}`);
  return res.json();
}
