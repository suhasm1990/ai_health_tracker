"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Sparkles,
  X,
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  Wrench,
  ChevronDown,
  ChevronUp,
  Moon,
  Heart,
  Footprints,
  BatteryCharging,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { ChatMessage, ToolExecutionSummary } from "@/lib/llm/types";

interface MessageItem extends ChatMessage {
  id: string;
  toolsCalled?: ToolExecutionSummary[];
  timestamp: string;
}

interface ChatAssistantProps {
  externalPrompt?: string | null;
  onClearExternalPrompt?: () => void;
}

const STARTER_PROMPTS = [
  { text: "How is my overall health today?", icon: Footprints },
  { text: "How well did I sleep last night?", icon: Moon },
  { text: "Any suggestions on my sleep and recovery?", icon: Sparkles },
  { text: "Analyze my heart rate and cardio zones", icon: Heart },
  { text: "Check my wearable battery and sync status", icon: BatteryCharging },
];

export const ChatAssistant: React.FC<ChatAssistantProps> = ({
  externalPrompt,
  onClearExternalPrompt,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [providerInfo, setProviderInfo] = useState<{ provider: string; model: string; hasApiKey: boolean }>({
    provider: "Sandbox Advisor",
    model: "google-health-agent",
    hasApiKey: false,
  });

  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "welcome-1",
      role: "assistant",
      content:
        "Hello! I am your **AI Health Coach** (Powered by Google Health API).\n\nI can inspect your live wearable data using real-time tool calling. Ask me questions like:\n- *\"How is my health today?\"*\n- *\"How well did I sleep?\"*\n- *\"Any suggestions to optimize my sleep and recovery?\"*",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch active provider metadata
  useEffect(() => {
    fetch("/api/chat")
      .then((res) => res.json())
      .then((data) => {
        if (data.provider) {
          setProviderInfo({
            provider: data.provider,
            model: data.model,
            hasApiKey: data.hasApiKey,
          });
        }
      })
      .catch((err) => console.error("Error checking chat provider:", err));
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  const toggleToolExpand = (msgId: string) => {
    setExpandedTools((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMessage: MessageItem = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Send conversation to backend agent
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        throw new Error(`Chat error (${res.status})`);
      }

      const data = await res.json();

      const assistantMessage: MessageItem = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message?.content || "I couldn't generate a response.",
        toolsCalled: data.toolsCalled || [],
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.provider && data.model) {
        setProviderInfo((prev) => ({
          ...prev,
          provider: data.provider,
          model: data.model,
        }));
      }
    } catch (err: any) {
      const errorMsg: MessageItem = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: `Sorry, an error occurred while analyzing your health data: ${err.message || "Network error"}. Please check your connection or LLM API keys in .env.local.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (externalPrompt) {
      setIsOpen(true);
      handleSendMessage(externalPrompt);
      onClearExternalPrompt?.();
    }
  }, [externalPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: "welcome-cleared",
        role: "assistant",
        content: "Conversation cleared. What health or sleep question can I answer for you?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  // Helper to format basic markdown (bold, lists, headers)
  const formatMarkdown = (content: string) => {
    const lines = content.split("\n");
    return lines.map((line, idx) => {
      // Header 3 or 4
      if (line.startsWith("### ")) {
        return (
          <h3 key={idx} className="text-sm font-bold text-slate-900 dark:text-white mt-2 mb-1">
            {line.replace("### ", "")}
          </h3>
        );
      }
      if (line.startsWith("#### ")) {
        return (
          <h4 key={idx} className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-2 mb-0.5">
            {line.replace("#### ", "")}
          </h4>
        );
      }
      // Bullet items
      if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
        const bulletText = line.trim().substring(2);
        return (
          <li key={idx} className="ml-4 list-disc text-slate-700 dark:text-slate-300 my-0.5 leading-relaxed">
            {renderBoldSpan(bulletText)}
          </li>
        );
      }
      // Numbered items
      if (/^\d+\.\s/.test(line.trim())) {
        const numText = line.trim().replace(/^\d+\.\s/, "");
        return (
          <li key={idx} className="ml-4 list-decimal text-slate-700 dark:text-slate-300 my-0.5 leading-relaxed">
            {renderBoldSpan(numText)}
          </li>
        );
      }
      // Blockquotes
      if (line.startsWith("> ")) {
        return (
          <blockquote
            key={idx}
            className="border-l-2 border-emerald-500 pl-2.5 py-0.5 my-1 text-slate-600 dark:text-slate-400 italic text-[11px]"
          >
            {renderBoldSpan(line.replace("> ", ""))}
          </blockquote>
        );
      }
      // Empty lines
      if (!line.trim()) {
        return <div key={idx} className="h-1.5" />;
      }
      // Regular paragraph
      return (
        <p key={idx} className="text-slate-700 dark:text-slate-300 my-0.5 leading-relaxed">
          {renderBoldSpan(line)}
        </p>
      );
    });
  };

  const renderBoldSpan = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-slate-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return (
          <em key={i} className="text-slate-500 dark:text-slate-400 italic">
            {part.slice(1, -1)}
          </em>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={i}
            className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded text-[11px] font-mono"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  return (
    <>
      {/* Floating Action Button (FAB) */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-40 group flex items-center space-x-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-4 py-3 rounded-full shadow-xl shadow-emerald-900/30 hover:shadow-emerald-900/50 hover:scale-105 active:scale-95 transition-all duration-200"
          aria-label="Open Health AI Assistant"
        >
          <Sparkles className="w-5 h-5 text-emerald-100 shrink-0 animate-pulse" />
          <span className="font-semibold text-sm tracking-tight pr-1">Ask Health AI</span>
        </button>
      )}

      {/* Floating Chat Popup */}
      {isOpen && (
        <div
          className={`fixed z-50 transition-all duration-300 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl overflow-hidden ${
            isExpanded
              ? "inset-4 sm:inset-10"
              : "bottom-6 right-6 w-full max-w-[440px] h-[640px] max-h-[90vh] max-sm:inset-x-2 max-sm:bottom-2 max-sm:max-w-none"
          }`}
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
                <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="truncate max-w-[200px]">
                    {providerInfo.provider} ({providerInfo.model})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={clearChat}
                title="Clear Chat"
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? "Collapse" : "Expand"}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors max-sm:hidden"
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close Assistant"
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`flex items-start space-x-2 max-w-[88%] ${
                    msg.role === "user" ? "flex-row-reverse space-x-reverse" : "flex-row"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>

                  <div
                    className={`rounded-2xl p-3.5 shadow-sm ${
                      msg.role === "user"
                        ? "bg-emerald-600 text-white rounded-tr-sm"
                        : "bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-tl-sm text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {/* Tool Calling Execution Pill */}
                    {msg.toolsCalled && msg.toolsCalled.length > 0 && (
                      <div className="mb-2.5 pb-2 border-b border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => toggleToolExpand(msg.id)}
                          className="w-full flex items-center justify-between text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                        >
                          <div className="flex items-center space-x-1.5">
                            <Wrench className="w-3.5 h-3.5" />
                            <span>
                              {msg.toolsCalled.length} health tool{msg.toolsCalled.length > 1 ? "s" : ""} called
                            </span>
                          </div>
                          {expandedTools[msg.id] ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {expandedTools[msg.id] && (
                          <div className="mt-2 space-y-1.5 animate-in fade-in duration-150">
                            {msg.toolsCalled.map((tool, tIdx) => (
                              <div
                                key={tIdx}
                                className="p-2 rounded-lg bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px]"
                              >
                                <div className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                                  ⚡ {tool.name}
                                </div>
                                {tool.resultSummary && (
                                  <div className="text-slate-600 dark:text-slate-400 mt-0.5 text-[10px]">
                                    {tool.resultSummary}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Markdown Formatted Body */}
                    <div>{formatMarkdown(msg.content)}</div>

                    <div
                      className={`text-[10px] mt-1.5 text-right ${
                        msg.role === "user" ? "text-emerald-100/70" : "text-slate-400 dark:text-slate-500"
                      }`}
                    >
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center space-x-2 text-slate-400 dark:text-slate-500 italic p-2 bg-slate-50 dark:bg-slate-950/40 rounded-xl border border-slate-100 dark:border-slate-800/60 w-fit">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                <span className="text-[11px]">Analyzing Google Health data & synthesizing advice...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Starter Chips (Only show if few messages) */}
          {messages.length <= 3 && (
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                Suggested questions:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_PROMPTS.map((prompt, idx) => {
                  const Icon = prompt.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(prompt.text)}
                      disabled={loading}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-[11px] transition-all shadow-xs"
                    >
                      <Icon className="w-3 h-3 text-emerald-500" />
                      <span>{prompt.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Input Box */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="relative flex items-center">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your health, sleep, recovery, or heart rate..."
                rows={1}
                disabled={loading}
                className="w-full pl-3.5 pr-12 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 resize-none max-h-28"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !input.trim()}
                className="absolute right-2 p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl shadow-md transition-colors"
                aria-label="Send message"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1">
              <span>Enter to send, Shift+Enter for new line</span>
              <span className="flex items-center space-x-1">
                <span>Model agnostic • Tool-calling agent</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
