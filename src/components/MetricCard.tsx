"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  isLoading?: boolean;
  goal?: {
    current: number;
    target: number;
    label?: string;
  };
  subtitle?: string;
  badge?: {
    text: string;
    type?: "positive" | "neutral" | "warning";
  };
  footerItems?: {
    label: string;
    value: string | number;
  }[];
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  icon: Icon,
  iconColor,
  iconBg,
  isLoading = false,
  goal,
  subtitle,
  badge,
  footerItems,
}) => {
  const percent = goal ? Math.min(Math.round((goal.current / goal.target) * 100), 100) : 0;

  return (
    <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md dark:hover:shadow-slate-950/40 shadow-xs">
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</span>
          <div className={`p-2.5 rounded-xl ${iconBg}`}>
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
        </div>

        {/* Main Value */}
        <div className="mt-3 flex items-baseline space-x-1.5">
          {isLoading ? (
            <div className="h-9 w-24 bg-slate-200 dark:bg-slate-800 rounded-lg animate-pulse my-0.5" />
          ) : (
            <>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {typeof value === "number" ? value.toLocaleString() : value}
              </span>
              {unit && <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{unit}</span>}
            </>
          )}
        </div>

        {/* Subtitle / Goal Progress */}
        {goal && (
          <div className="mt-3">
            <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 mb-1.5">
              <span>{goal.label || "Daily Goal"}</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {isLoading ? "—" : `${percent}% (${goal.target.toLocaleString()})`}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isLoading
                    ? "w-1/3 bg-slate-200 dark:bg-slate-700 animate-pulse"
                    : percent >= 100
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-emerald-500 to-teal-400"
                }`}
                style={isLoading ? undefined : { width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {subtitle && !goal && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">{subtitle}</p>
        )}

        {badge && (
          <div className="mt-2">
            <span
              className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                badge.type === "positive"
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  : badge.type === "warning"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              {badge.text}
            </span>
          </div>
        )}
      </div>

      {/* Footer Breakdown items */}
      {footerItems && footerItems.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
          {footerItems.map((item, idx) => (
            <div key={idx}>
              <span className="text-slate-400 dark:text-slate-500 text-[11px] block">{item.label}</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
