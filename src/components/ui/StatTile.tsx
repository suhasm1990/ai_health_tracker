import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatTileProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  iconClass?: string;
  valueClass?: string;
  size?: "sm" | "lg";
  className?: string;
}

/** Compact highlight tile used above charts. */
export function StatTile({ label, value, sub, icon: Icon, iconClass = "", valueClass = "text-slate-900 dark:text-white", size = "sm", className = "" }: StatTileProps) {
  const large = size === "lg";
  return (
    <div className={`bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 ${large ? "p-3" : "p-2.5"} ${className}`}>
      <div className={`flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 ${large ? "mb-1" : ""}`}>
        {Icon && <Icon className={`w-3.5 h-3.5 ${iconClass}`} />}
        <span>{label}</span>
      </div>
      <div className={`font-bold ${large ? "text-lg sm:text-xl" : "text-sm sm:text-base"} ${valueClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{sub}</div>}
    </div>
  );
}
