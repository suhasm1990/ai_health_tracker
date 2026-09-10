"use client";

import React, { useState } from "react";
import { X, Play, Code2, Copy, Check, Terminal, Database, AlertCircle, Info } from "lucide-react";

interface ApiTesterProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_ENDPOINTS = [
  {
    name: "List Step DataPoints",
    method: "GET",
    endpoint: "/users/me/dataTypes/steps/dataPoints?pageSize=10",
  },
  {
    name: "List Exercise DataPoints",
    method: "GET",
    endpoint: "/users/me/dataTypes/exercise/dataPoints?pageSize=5",
  },
  {
    name: "List Sleep DataPoints",
    method: "GET",
    endpoint: "/users/me/dataTypes/sleep/dataPoints?pageSize=2",
  },
  {
    name: "Daily RollUp: Steps",
    method: "POST",
    endpoint: "/users/me/dataTypes/steps/dataPoints:dailyRollUp",
    body: {
      range: {
        start: {
          date: { year: 2026, month: 9, day: 1 },
          time: { hours: 0, minutes: 0, seconds: 0 },
        },
        end: {
          date: { year: 2026, month: 9, day: 10 },
          time: { hours: 23, minutes: 59, seconds: 59 },
        },
      },
      windowSizeDays: 1,
    },
  },
  {
    name: "Daily RollUp: Calories",
    method: "POST",
    endpoint: "/users/me/dataTypes/total-calories/dataPoints:dailyRollUp",
    body: {
      range: {
        start: {
          date: { year: 2026, month: 9, day: 1 },
          time: { hours: 0, minutes: 0, seconds: 0 },
        },
        end: {
          date: { year: 2026, month: 9, day: 10 },
          time: { hours: 23, minutes: 59, seconds: 59 },
        },
      },
      windowSizeDays: 1,
    },
  },
  {
    name: "Daily RollUp: Heart Rate",
    method: "POST",
    endpoint: "/users/me/dataTypes/heart-rate/dataPoints:dailyRollUp",
    body: {
      range: {
        start: {
          date: { year: 2026, month: 9, day: 1 },
          time: { hours: 0, minutes: 0, seconds: 0 },
        },
        end: {
          date: { year: 2026, month: 9, day: 10 },
          time: { hours: 23, minutes: 59, seconds: 59 },
        },
      },
      windowSizeDays: 1,
    },
  },
  {
    name: "Daily RollUp: Distance",
    method: "POST",
    endpoint: "/users/me/dataTypes/distance/dataPoints:dailyRollUp",
    body: {
      range: {
        start: {
          date: { year: 2026, month: 9, day: 1 },
          time: { hours: 0, minutes: 0, seconds: 0 },
        },
        end: {
          date: { year: 2026, month: 9, day: 10 },
          time: { hours: 23, minutes: 59, seconds: 59 },
        },
      },
      windowSizeDays: 1,
    },
  },
  {
    name: "List Heart Rate DataPoints",
    method: "GET",
    endpoint: "/users/me/dataTypes/heart-rate/dataPoints?pageSize=5",
  },
  {
    name: "List SpO2 DataPoints",
    method: "GET",
    endpoint: "/users/me/dataTypes/oxygen-saturation/dataPoints?pageSize=2",
  },
  {
    name: "List HRV DataPoints",
    method: "GET",
    endpoint: "/users/me/dataTypes/heart-rate-variability/dataPoints?pageSize=2",
  },
  {
    name: "List Paired Devices (Requires settings scope)",
    method: "GET",
    endpoint: "/users/me/pairedDevices",
  },
];

export const ApiTester: React.FC<ApiTesterProps> = ({ isOpen, onClose }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState(PRESET_ENDPOINTS[0].endpoint);
  const [method, setMethod] = useState(PRESET_ENDPOINTS[0].method);
  const [requestBody, setRequestBody] = useState("");
  const [responseOutput, setResponseOutput] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSelectPreset = (preset: typeof PRESET_ENDPOINTS[0]) => {
    setSelectedEndpoint(preset.endpoint);
    setMethod(preset.method);
    setRequestBody(preset.body ? JSON.stringify(preset.body, null, 2) : "");
  };

  const handleSendRequest = async () => {
    setLoading(true);
    setResponseOutput(null);

    try {
      let parsedBody = undefined;
      if (method === "POST" && requestBody.trim()) {
        try {
          parsedBody = JSON.parse(requestBody);
        } catch {
          setResponseOutput({ error: "Invalid JSON in request body" });
          setLoading(false);
          return;
        }
      }

      const res = await fetch("/api/health/raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: selectedEndpoint,
          method,
          body: parsedBody,
        }),
      });

      const data = await res.json();
      setResponseOutput(data);
    } catch (err: any) {
      setResponseOutput({ error: err.message || "Failed to execute request" });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (!responseOutput) return;
    navigator.clipboard.writeText(JSON.stringify(responseOutput, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Google Health API Explorer & Tester</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Directly query REST endpoints and inspect live v4 responses</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Preset Buttons */}
          <div>
            <span className="text-slate-700 dark:text-slate-300 font-semibold mb-2 block">Presets:</span>
            <div className="flex flex-wrap gap-2">
              {PRESET_ENDPOINTS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPreset(preset)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    selectedEndpoint === preset.endpoint && method === preset.method
                      ? "bg-cyan-600/15 border-cyan-500/50 text-cyan-700 dark:text-cyan-300 shadow-xs"
                      : "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
                  }`}
                >
                  <span className="font-mono text-[10px] text-cyan-600 dark:text-cyan-400 mr-1.5 font-bold">{preset.method}</span>
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Request URL bar */}
          <div className="flex items-center space-x-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>

            <div className="flex-1 flex items-center bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2">
              <span className="text-slate-500 font-mono text-xs">https://health.googleapis.com/v4</span>
              <input
                type="text"
                value={selectedEndpoint}
                onChange={(e) => setSelectedEndpoint(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-900 dark:text-white font-mono text-xs focus:outline-none ml-1 placeholder:text-slate-400 dark:placeholder:text-slate-600"
                placeholder="/users/me/pairedDevices"
              />
            </div>

            <button
              onClick={handleSendRequest}
              disabled={loading}
              className="flex items-center space-x-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold shadow-md shadow-cyan-950/20 dark:shadow-cyan-950/40 transition-all text-xs shrink-0"
            >
              <Play className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Sending..." : "Send"}</span>
            </button>
          </div>

          {/* Request Body (for POST) */}
          {method === "POST" && (
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Request Payload (JSON):</label>
              <textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                rows={4}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white font-mono text-xs placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                placeholder='{ "range": { ... } }'
              />
            </div>
          )}

          {/* 403 Insufficient Scopes Guidance */}
          {responseOutput && (responseOutput.status === 403 || responseOutput?.data?.error?.code === 403) && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1.5 animate-in fade-in">
              <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Notice: HTTP 403 Insufficient Scope</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                This endpoint (e.g. <code className="bg-amber-500/10 px-1 py-0.5 rounded text-[11px] font-mono">/users/me/pairedDevices</code>) requires the additional Google Cloud OAuth scope <code className="bg-amber-500/10 px-1 py-0.5 rounded text-[11px] font-mono">googlehealth.settings.readonly</code>.
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                💡 <strong>Good news:</strong> Your current access token has full permissions for <strong>Steps, Activity, Exercise, Sleep, Nutrition, and Health Metrics</strong>. Click on <strong>List Step DataPoints</strong>, <strong>List Exercise</strong>, <strong>List Sleep</strong>, or <strong>Daily RollUp</strong> above to query live data!
              </p>
            </div>
          )}

          {/* Response Output Console */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center space-x-1.5">
                <Database className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span>Response Output</span>
              </span>
              {responseOutput && (
                <button
                  onClick={copyResponse}
                  className="flex items-center space-x-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied" : "Copy JSON"}</span>
                </button>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 h-64 overflow-y-auto">
              {loading ? (
                <div className="h-full flex items-center justify-center text-slate-400">
                  Executing Google Health API request...
                </div>
              ) : responseOutput ? (
                <pre>{JSON.stringify(responseOutput, null, 2)}</pre>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Click &apos;Send&apos; to execute the endpoint request and view JSON response.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/80 dark:bg-slate-950/40">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
