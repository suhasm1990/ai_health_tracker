"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Share2,
  Copy,
  Check,
  Download,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { DailyMetricSummary } from "@/lib/types";

interface ShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  today: DailyMetricSummary;
  userName?: string;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({
  isOpen,
  onClose,
  today,
  userName = "Health Champion",
}) => {
  const [copiedText, setCopiedText] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formattedDate = new Date(today.date || Date.now()).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Calculate quick stats
  const steps = today.steps || 0;
  const stepsGoal = today.stepsGoal || 10000;
  const stepPct = Math.round((steps / stepsGoal) * 100);
  const sleepHrs = Math.floor((today.sleepDurationMinutes || 0) / 60);
  const sleepMins = (today.sleepDurationMinutes || 0) % 60;
  const sleepFormatted = today.sleepDurationMinutes ? `${sleepHrs}h ${sleepMins}m` : "—";
  const rhr = today.restingHeartRate ? `${today.restingHeartRate} bpm` : "—";
  const calories = today.caloriesBurned ? `${today.caloriesBurned.toLocaleString()} kcal` : "—";

  // Formatted share text for WhatsApp/Messages
  const shareText = `🏃‍♂️ ${userName}'s Daily Health Snapshot (${formattedDate}):\n` +
    `👣 Steps: ${steps.toLocaleString()} / ${stepsGoal.toLocaleString()} (${stepPct}%)\n` +
    `🔥 Calories: ${calories}\n` +
    `❤️ Resting HR: ${rhr}\n` +
    `🌙 Sleep: ${sleepFormatted} (Score: ${today.sleepScore || "—"})\n` +
    `⚡ Active Minutes: ${today.activeZoneMinutes || 0}m\n\n` +
    `✨ Tracked via AI Health Tracker (Powered by Google Health API)`;

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  // Render canvas graphic
  const drawCardToCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Retina scale
    const width = 800;
    const height = 480;
    canvas.width = width;
    canvas.height = height;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#090d16");
    bgGrad.addColorStop(0.5, "#0f172a");
    bgGrad.addColorStop(1, "#020617");
    ctx.fillStyle = bgGrad;
    ctx.roundRect ? ctx.roundRect(0, 0, width, height, 32) : ctx.rect(0, 0, width, height);
    ctx.fill();

    // Subtle decorative glow circles
    const glow1 = ctx.createRadialGradient(700, 80, 10, 700, 80, 260);
    glow1.addColorStop(0, "rgba(16, 185, 129, 0.22)");
    glow1.addColorStop(1, "transparent");
    ctx.fillStyle = glow1;
    ctx.beginPath();
    ctx.arc(700, 80, 260, 0, Math.PI * 2);
    ctx.fill();

    const glow2 = ctx.createRadialGradient(100, 400, 10, 100, 400, 240);
    glow2.addColorStop(0, "rgba(6, 182, 212, 0.18)");
    glow2.addColorStop(1, "transparent");
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.arc(100, 400, 240, 0, Math.PI * 2);
    ctx.fill();

    // Border stroke
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(1, 1, width - 2, height - 2, 32);
      ctx.stroke();
    }

    // Header: App badge
    ctx.fillStyle = "#10B981";
    ctx.font = "bold 14px Inter, system-ui, sans-serif";
    ctx.fillText("AI HEALTH TRACKER", 48, 56);

    // Title: User snapshot
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Inter, system-ui, sans-serif";
    ctx.fillText(`${userName}'s Daily Snapshot`, 48, 96);

    // Subtitle date
    ctx.fillStyle = "#94a3b8";
    ctx.font = "16px Inter, system-ui, sans-serif";
    ctx.fillText(formattedDate, 48, 126);

    // Grid layout for 4 key metric cards
    const cardData = [
      { label: "DAILY STEPS", value: `${steps.toLocaleString()}`, sub: `${stepPct}% of goal`, color: "#10B981" },
      { label: "ACTIVE ZONE", value: `${today.activeZoneMinutes || 0} mins`, sub: "Fat burn & cardio", color: "#14B8A6" },
      { label: "RESTING HR", value: rhr, sub: "Nightly baseline", color: "#F43F5E" },
      { label: "SLEEP SCORE", value: today.sleepScore ? `${today.sleepScore}/100` : sleepFormatted, sub: sleepFormatted, color: "#818CF8" },
    ];

    const startX = 48;
    const startY = 160;
    const cardW = 164;
    const cardH = 130;
    const gap = 16;

    cardData.forEach((c, idx) => {
      const cx = startX + idx * (cardW + gap);
      // Box background
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(cx, startY, cardW, cardH, 16);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.stroke();
      } else {
        ctx.fillRect(cx, startY, cardW, cardH);
      }

      // Top accent bar
      ctx.fillStyle = c.color;
      ctx.fillRect(cx + 16, startY + 16, 24, 4);

      // Label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.fillText(c.label, cx + 16, startY + 44);

      // Value
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 20px Inter, system-ui, sans-serif";
      ctx.fillText(c.value, cx + 16, startY + 76);

      // Sub
      ctx.fillStyle = "#64748b";
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillText(c.sub, cx + 16, startY + 102);
    });

    // Bottom banner
    ctx.fillStyle = "rgba(16, 185, 129, 0.08)";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(48, 320, width - 96, 96, 16);
      ctx.fill();
      ctx.strokeStyle = "rgba(16, 185, 129, 0.2)";
      ctx.stroke();
    }

    ctx.fillStyle = "#34d399";
    ctx.font = "bold 15px Inter, system-ui, sans-serif";
    ctx.fillText("🌟 Habit Momentum & Vitality", 72, 356);

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "13px Inter, system-ui, sans-serif";
    ctx.fillText(
      `Burned ${calories} with continuous biometric telemetry synced via Fitbit & Apple Health.`,
      72,
      386
    );

    // Footer tag
    ctx.fillStyle = "#475569";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillText("AI Health Tracker • Powered by Google Health API", 48, 450);
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(drawCardToCanvas, 100);
    }
  }, [isOpen, today]);

  const handleDownloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDownloading(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `HealthSnapshot-${today.date || "today"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Error downloading canvas image:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleWhatsAppShare = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                Share Daily Health Snapshot
              </h3>
              <p className="text-xs text-slate-400">
                Export and celebrate your progress with family & friends
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Card Preview (Live Canvas) */}
          <div className="relative rounded-xl overflow-hidden border border-slate-800 shadow-lg flex justify-center bg-slate-950">
            <canvas
              ref={canvasRef}
              className="w-full h-auto max-w-full rounded-xl object-contain block"
              style={{ maxHeight: "300px" }}
            />
          </div>

          {/* Quick Share Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleCopyText}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-all cursor-pointer shadow-xs"
            >
              {copiedText ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Summary Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-300" />
                  <span>Copy Text Summary</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadImage}
              disabled={isDownloading}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-all cursor-pointer shadow-md shadow-emerald-600/20"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloading ? "Saving..." : "Download Card Image"}</span>
            </button>

            <button
              onClick={handleWhatsAppShare}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] text-xs font-semibold border border-[#25D366]/30 transition-all cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Share to WhatsApp</span>
            </button>
          </div>

          {/* Text Summary Preview */}
          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              WhatsApp & Message Preview:
            </span>
            <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
              {shareText}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
