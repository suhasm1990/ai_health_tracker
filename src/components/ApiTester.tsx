"use client";

import { AlertCircle, Check, Copy, Database, Play, Terminal, X } from "lucide-react";
import { useState } from "react";
import { isoToCivil, shiftIso, todayIso } from "@/lib/utils";

interface ApiTesterProps {
  onClose: () => void;
  apiVersion: string;
}

interface Preset {
  name: string;
  method: "GET" | "POST";
  endpoint: string;
  body?: unknown;
}

const METHODS = ["GET", "POST", "PATCH", "DELETE"];

/** Daily rollup over the last 10 days, so presets never go stale. */
function rollupPreset(name: string, dataType: string): Preset {
  const today = todayIso();
  return {
    name: `Daily RollUp: ${name}`,
    method: "POST",
    endpoint: `/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`,
    body: {
      range: {
        start: { date: isoToCivil(shiftIso(today, -9)), time: { hours: 0, minutes: 0, seconds: 0 } },
        end: { date: isoToCivil(today), time: { hours: 23, minutes: 59, seconds: 59 } },
      },
      windowSizeDays: 1,
    },
  };
}

const listPreset = (name: string, dataType: string, pageSize: number): Preset => ({
  name: `List ${name} DataPoints`,
  method: "GET",
  endpoint: `/users/me/dataTypes/${dataType}/dataPoints?pageSize=${pageSize}`,
});

const PRESETS: Preset[] = [
  listPreset("Step", "steps", 10),
  listPreset("Exercise", "exercise", 5),
  listPreset("Sleep", "sleep", 2),
  rollupPreset("Steps", "steps"),
  rollupPreset("Calories", "total-calories"),
  rollupPreset("Heart Rate", "heart-rate"),
  rollupPreset("Distance", "distance"),
  listPreset("Heart Rate", "heart-rate", 5),
  listPreset("SpO2", "oxygen-saturation", 2),
  listPreset("HRV", "heart-rate-variability", 2),
  { name: "List Paired Devices (Requires settings scope)", method: "GET", endpoint: "/users/me/pairedDevices" },
];

const INPUT = "bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-cyan-500";

export function ApiTester({ onClose, apiVersion }: ApiTesterProps) {
  const [endpoint, setEndpoint] = useState(PRESETS[0].endpoint);
  const [method, setMethod] = useState<string>(PRESETS[0].method);
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<{ status: number; data: unknown } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectPreset = (preset: Preset) => {
    setEndpoint(preset.endpoint);
    setMethod(preset.method);
    setBody(preset.body ? JSON.stringify(preset.body, null, 2) : "");
  };

  const sendRequest = async () => {
    let payload: unknown;
    if (method !== "GET" && body.trim()) {
      try {
        payload = JSON.parse(body);
      } catch {
        setResponse({ status: 0, data: { error: "Invalid JSON in request body" } });
        return;
      }
    }
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch("/api/health/raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, method, body: payload }),
      });
      setResponse({ status: res.status, data: await res.json().catch(() => ({ error: `HTTP ${res.status}` })) });
    } catch (err) {
      setResponse({ status: 0, data: { error: err instanceof Error ? err.message : "Failed to execute request" } });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = async () => {
    if (!response) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="api-tester-title">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-200">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 id="api-tester-title" className="text-base font-bold text-slate-900 dark:text-white">Google Health API Explorer & Tester</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Directly query REST endpoints and inspect live {apiVersion} responses</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div>
            <span className="text-slate-700 dark:text-slate-300 font-semibold mb-2 block">Presets:</span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => {
                const active = endpoint === preset.endpoint && method === preset.method;
                return (
                  <button
                    key={preset.name}
                    onClick={() => selectPreset(preset)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      active
                        ? "bg-cyan-600/15 border-cyan-500/50 text-cyan-700 dark:text-cyan-300 shadow-xs"
                        : "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400 mr-1.5 font-bold">{preset.method}</span>
                    <span>{preset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <select value={method} onChange={(e) => setMethod(e.target.value)} aria-label="HTTP method" className={`rounded-xl px-3 py-2 ${INPUT}`}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className={`flex-1 flex items-center rounded-xl px-3 py-2 ${INPUT}`}>
              <span className="text-slate-500">https://health.googleapis.com/{apiVersion}</span>
              <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} aria-label="Endpoint path" className="flex-1 bg-transparent border-none font-mono text-xs focus:outline-none ml-1 placeholder:text-slate-400 dark:placeholder:text-slate-600" placeholder="/users/me/pairedDevices" />
            </div>
            <button onClick={sendRequest} disabled={loading} className="flex items-center space-x-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold shadow-md shadow-cyan-950/20 dark:shadow-cyan-950/40 transition-all text-xs shrink-0">
              <Play className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Sending..." : "Send"}</span>
            </button>
          </div>

          {method !== "GET" && (
            <div>
              <label htmlFor="api-body" className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Request Payload (JSON):</label>
              <textarea id="api-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={`w-full rounded-xl p-3 placeholder:text-slate-400 dark:placeholder:text-slate-600 ${INPUT}`} placeholder='{ "range": { ... } }' />
            </div>
          )}

          {response?.status === 403 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1.5 animate-in fade-in">
              <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Notice: HTTP 403 Insufficient Scope</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                This endpoint requires an OAuth scope your token does not include (for example <code className="bg-amber-500/10 px-1 py-0.5 rounded text-[11px] font-mono">googlehealth.settings.readonly</code> for paired devices).
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                💡 The activity, exercise, sleep and health-metric presets above work with the scopes granted at sign-in.
              </p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Response Output{response ? ` (HTTP ${response.status || "error"})` : ""}</span>
              </span>
              {response && (
                <button onClick={copyResponse} className="flex items-center space-x-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy JSON"}</span>
                </button>
              )}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 h-64 overflow-y-auto">
              {loading ? (
                <div className="h-full flex items-center justify-center text-slate-400">Executing Google Health API request...</div>
              ) : response ? (
                <pre>{JSON.stringify(response.data, null, 2)}</pre>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">Click &apos;Send&apos; to execute the endpoint request and view the JSON response.</div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/80 dark:bg-slate-950/40">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
