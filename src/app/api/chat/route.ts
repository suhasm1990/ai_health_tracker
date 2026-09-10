import { NextRequest, NextResponse } from "next/server";
import { runHealthAgent, resolveLlmConfig } from "@/lib/llm/agent";
import { ChatMessage } from "@/lib/llm/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, config } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'messages' array in request body" },
        { status: 400 }
      );
    }

    const cleanMessages: ChatMessage[] = messages.map((m: any) => ({
      role: m.role || "user",
      content: String(m.content || ""),
    }));

    const response = await runHealthAgent(cleanMessages, config);

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("API /api/chat error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process chat message" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const config = resolveLlmConfig();
  return NextResponse.json({
    provider: config.provider,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
    configuredVia: config.apiKey ? "Configured" : "Default Sandbox Advisor",
    supportedProviders: [
      { id: "nvidia", name: "NVIDIA NIM", defaultModel: "meta/llama-3.3-70b-instruct" },
      { id: "google", name: "Google Gemini", defaultModel: "gemini-2.5-flash" },
      { id: "openai", name: "OpenAI / Compatible", defaultModel: "gpt-4o-mini" },
    ],
  });
}
