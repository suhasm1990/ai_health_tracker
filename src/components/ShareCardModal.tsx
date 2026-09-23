"use client";

import { Check, Copy, Download, MessageCircle, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DailyMetricSummary } from "@/lib/types";
import { formatDuration, pct, withUnit } from "@/lib/utils";

interface ShareCardModalProps {
  onClose: () => void;
  today: DailyMetricSummary;
  userName?: string;
}

const WIDTH = 800;
const HEIGHT = 480;
const SCALE = 2; // retina export
const FONT = "Inter, system-ui, sans-serif";

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 10, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string) {
  ctx.fillStyle = color;
  ctx.font = `${font} ${FONT}`;
  ctx.fillText(value, x, y);
}

export function ShareCardModal({ onClose, today, userName = "Health Champion" }: ShareCardModalProps) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const date = new Date(`${today.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const stepPct = pct(today.steps, today.stepsGoal);
  const sleep = today.sleepDurationMinutes ? formatDuration(today.sleepDurationMinutes) : "—";
  const rhr = withUnit(today.restingHeartRate, "bpm");
  const calories = withUnit(today.caloriesBurned, "kcal");

  const shareText =
    `🏃‍♂️ ${userName}'s Daily Health Snapshot (${date}):\n` +
    `👣 Steps: ${today.steps.toLocaleString()} / ${today.stepsGoal.toLocaleString()} (${stepPct}%)\n` +
    `🔥 Calories: ${calories}\n` +
    `❤️ Resting HR: ${rhr}\n` +
    `🌙 Sleep: ${sleep} (Score: ${today.sleepScore || "—"})\n` +
    `⚡ Active Minutes: ${today.activeZoneMinutes}m\n\n` +
    `✨ Tracked via AI Health Tracker (Powered by Google Health API)`;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.canvas.width = WIDTH * SCALE;
    ctx.canvas.height = HEIGHT * SCALE;
    ctx.scale(SCALE, SCALE);

    const background = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    background.addColorStop(0, "#090d16");
    background.addColorStop(0.5, "#0f172a");
    background.addColorStop(1, "#020617");
    ctx.fillStyle = background;
    roundedRect(ctx, 0, 0, WIDTH, HEIGHT, 32);
    ctx.fill();
    glow(ctx, 700, 80, 260, "rgba(16, 185, 129, 0.22)");
    glow(ctx, 100, 400, 240, "rgba(6, 182, 212, 0.18)");
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    roundedRect(ctx, 1, 1, WIDTH - 2, HEIGHT - 2, 32);
    ctx.stroke();

    text(ctx, "AI HEALTH TRACKER", 48, 56, "bold 14px", "#10B981");
    text(ctx, `${userName}'s Daily Snapshot`, 48, 96, "bold 28px", "#ffffff");
    text(ctx, date, 48, 126, "16px", "#94a3b8");

    const cards = [
      { label: "DAILY STEPS", value: today.steps.toLocaleString(), sub: `${stepPct}% of goal`, color: "#10B981" },
      { label: "ACTIVE ZONE", value: `${today.activeZoneMinutes} mins`, sub: "Fat burn & cardio", color: "#14B8A6" },
      { label: "RESTING HR", value: rhr, sub: "Nightly baseline", color: "#F43F5E" },
      { label: "SLEEP SCORE", value: today.sleepScore ? `${today.sleepScore}/100` : sleep, sub: sleep, color: "#818CF8" },
    ];
    cards.forEach((card, i) => {
      const x = 48 + i * 180;
      const y = 160;
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      roundedRect(ctx, x, y, 164, 130, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();
      ctx.fillStyle = card.color;
      ctx.fillRect(x + 16, y + 16, 24, 4);
      text(ctx, card.label, x + 16, y + 44, "600 11px", "#94a3b8");
      text(ctx, card.value, x + 16, y + 76, "bold 20px", "#ffffff");
      text(ctx, card.sub, x + 16, y + 102, "12px", "#64748b");
    });

    ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
    roundedRect(ctx, 48, 320, WIDTH - 96, 96, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(16, 185, 129, 0.2)";
    ctx.stroke();
    text(ctx, "🌟 Habit Momentum & Vitality", 72, 356, "bold 15px", "#34d399");
    text(ctx, `Burned ${calories} with continuous biometric telemetry synced via Fitbit & Apple Health.`, 72, 386, "13px", "#cbd5e1");
    text(ctx, "AI Health Tracker • Powered by Google Health API", 48, 450, "11px", "#475569");
  }, [today, userName, date, stepPct, sleep, rhr, calories]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `HealthSnapshot-${today.date}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const shareWhatsApp = () => window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 id="share-title" className="text-base font-semibold text-white">Share Daily Health Snapshot</h3>
              <p className="text-xs text-slate-400">Export and celebrate your progress with family & friends</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="rounded-xl overflow-hidden border border-slate-800 shadow-lg flex justify-center bg-slate-950">
            <canvas ref={canvasRef} className="w-full h-auto rounded-xl block" style={{ maxHeight: 300 }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={copyText} className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-all shadow-xs">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
              <span className={copied ? "text-emerald-400" : ""}>{copied ? "Summary Copied!" : "Copy Text Summary"}</span>
            </button>
            <button onClick={download} className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all shadow-md shadow-emerald-600/20">
              <Download className="w-4 h-4" />
              <span>Download Card Image</span>
            </button>
            <button onClick={shareWhatsApp} className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] text-xs font-semibold border border-[#25D366]/30 transition-all">
              <MessageCircle className="w-4 h-4" />
              <span>Share to WhatsApp</span>
            </button>
          </div>

          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">WhatsApp & Message Preview:</span>
            <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">{shareText}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
