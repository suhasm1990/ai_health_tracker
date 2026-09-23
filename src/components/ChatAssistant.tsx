"use client";

import { BatteryCharging, Bot, ChevronDown, ChevronUp, Footprints, Heart, Loader2, Maximize2, Minimize2, Moon, Send, Sparkles, Trash2, User, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import type { AgentResponse, ChatMessage, ToolExecutionSummary } from "@/lib/llm/types";
import type { LlmStatus } from "@/lib/types";
import { formatClock } from "@/lib/utils";

interface MessageItem extends ChatMessage {
  id: string;
  timestamp: string;
  toolsCalled?: ToolExecutionSummary[];
}

interface ChatAssistantProps {
  /** A prompt injected from elsewhere in the dashboard; sent as soon as it changes. */
  externalPrompt: string | null;
  onExternalPromptConsumed: () => void;
  llm?: LlmStatus;
}

const STARTER_PROMPTS = [
  { text: "How is my overall health today?", icon: Footprints },
  { text: "How well did I sleep last night?", icon: Moon },
  { text: "Any suggestions on my sleep and recovery?", icon: Sparkles },
  { text: "Analyze my heart rate and cardio zones", icon: Heart },
  { text: "Check my wearable battery and sync status", icon: BatteryCharging },
];

const WELCOME =
  'Hello! I am your **AI Health Coach** (Powered by Google Health API).\n\nI can inspect your live wearable data using real-time tool calling. Ask me questions like:\n- *"How is my health today?"*\n- *"How well did I sleep?"*\n- *"Any suggestions to optimize my sleep and recovery?"*';

const assistantMessage = (content: string, extra: Partial<MessageItem> = {}): MessageItem => ({
  id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  role: "assistant",
  content,
  timestamp: formatClock(),
  ...extra,
});

const ICON_BTN = "p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors";

export function ChatAssistant({ externalPrompt, onExternalPromptConsumed, llm }: ChatAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState({ name: llm?.provider ?? "Sandbox Health Advisor", model: llm?.model ?? "google-health-agent" });
  const [messages, setMessages] = useState<MessageItem[]>(() => [assistantMessage(WELCOME, { id: "welcome" })]);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const messagesRef = useRef(messages);
  const busy = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
    if (isOpen) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  const send = useCallback(async (raw: string) => {
    const query = raw.trim();
    if (!query || busy.current) return;
    busy.current = true;
    setLoading(true);
    setInput("");

    const history = [...messagesRef.current, { id: `user-${Date.now()}`, role: "user" as const, content: query, timestamp: formatClock() }];
    setMessages(history);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      const data: Partial<AgentResponse> & { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Chat error (${res.status})`);
      setMessages((prev) => [...prev, assistantMessage(data.message?.content || "I couldn't generate a response.", { toolsCalled: data.toolsCalled ?? [] })]);
      if (data.provider && data.model) setProvider({ name: data.provider, model: data.model });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Network error";
      setMessages((prev) => [...prev, assistantMessage(`Sorry, an error occurred while analyzing your health data: ${reason}. Please check your connection or LLM API keys in .env.local.`)]);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!externalPrompt) return;
    setIsOpen(true);
    void send(externalPrompt);
    onExternalPromptConsumed();
  }, [externalPrompt, send, onExternalPromptConsumed]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const clearChat = () => setMessages([assistantMessage("Conversation cleared. What health or sleep question can I answer for you?", { id: "welcome-cleared" })]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open Health AI Assistant"
        className="fixed bottom-6 right-6 z-40 flex items-center space-x-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-3 rounded-full shadow-xl shadow-emerald-900/30 hover:shadow-emerald-900/50 hover:scale-105 active:scale-95 transition-all duration-200"
      >
        <Sparkles className="w-5 h-5 text-emerald-100 shrink-0 animate-pulse" />
        <span className="font-semibold text-sm tracking-tight pr-1">Ask Health AI</span>
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 transition-all duration-300 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl overflow-hidden ${
        isExpanded ? "inset-4 sm:inset-10" : "bottom-6 right-6 w-full max-w-[440px] h-[640px] max-h-[90vh] max-sm:inset-x-2 max-sm:bottom-2 max-sm:max-w-none"
      }`}
      role="dialog"
      aria-label="Health AI Assistant"
    >
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-900/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Health AI Assistant</h3>
              <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500" title="Online" />
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
              {provider.name} ({provider.model})
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={clearChat} title="Clear Chat" className={ICON_BTN}>
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setIsExpanded((v) => !v)} title={isExpanded ? "Collapse" : "Expand"} className={`${ICON_BTN} max-sm:hidden`}>
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} title="Close Assistant" className={ICON_BTN}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const tools = msg.toolsCalled ?? [];
          return (
            <div key={msg.id} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
              <div className={`flex items-start space-x-2 max-w-[88%] ${isUser ? "flex-row-reverse space-x-reverse" : ""}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-emerald-600 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                </div>
                <div className={`rounded-2xl p-3.5 shadow-sm ${isUser ? "bg-emerald-600 text-white rounded-tr-sm" : "bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-tl-sm text-slate-800 dark:text-slate-200"}`}>
                  {tools.length > 0 && (
                    <div className="mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-700">
                      <button onClick={() => setExpandedTools((p) => ({ ...p, [msg.id]: !p[msg.id] }))} className="w-full flex items-center justify-between text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-lg transition-colors">
                        <span className="flex items-center space-x-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          <span>
                            {tools.length} health tool{tools.length > 1 ? "s" : ""} called
                          </span>
                        </span>
                        {expandedTools[msg.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                      {expandedTools[msg.id] && (
                        <div className="mt-2 space-y-1.5 animate-in fade-in duration-150">
                          {tools.map((tool, i) => (
                            <div key={i} className="p-2 rounded-lg bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px]">
                              <div className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">⚡ {tool.name}</div>
                              {tool.resultSummary && <div className="text-slate-600 dark:text-slate-400 mt-0.5 text-[10px]">{tool.resultSummary}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className={isUser ? "[&_p]:text-white [&_strong]:text-white" : ""}>{renderMarkdown(msg.content)}</div>
                  <div className={`text-[10px] mt-1.5 text-right ${isUser ? "text-emerald-100/70" : "text-slate-400 dark:text-slate-500"}`}>{msg.timestamp}</div>
                </div>
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-center space-x-2 text-slate-400 dark:text-slate-500 italic p-2 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800/60 w-fit">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
            <span className="text-[11px]">Analyzing Google Health data & synthesizing advice...</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {messages.length <= 3 && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30">
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Suggested questions:</div>
          <div className="flex flex-wrap gap-1.5">
            {STARTER_PROMPTS.map(({ text, icon: Icon }) => (
              <button key={text} onClick={() => send(text)} disabled={loading} className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-[11px] transition-all shadow-xs">
                <Icon className="w-3 h-3 text-emerald-500" />
                <span>{text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about your health, sleep, recovery, or heart rate..."
            rows={1}
            disabled={loading}
            aria-label="Message"
            className="w-full pl-3.5 pr-12 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 resize-none max-h-28"
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} aria-label="Send message" className="absolute right-2 p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl shadow-md transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1">
          <span>Enter to send, Shift+Enter for new line</span>
          <span>Model agnostic • Tool-calling agent</span>
        </div>
      </div>
    </div>
  );
}
