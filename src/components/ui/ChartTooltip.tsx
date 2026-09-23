import type { ReactNode } from "react";

export function TooltipBox({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1.5 ${className}`}>
      {children}
    </div>
  );
}

interface TooltipRowProps {
  label: string;
  value: ReactNode;
  /** Swatch colour class, e.g. "bg-rose-500". */
  swatch?: string;
  valueClass?: string;
  className?: string;
}

export function TooltipRow({ label, value, swatch, valueClass = "text-slate-900 dark:text-white", className = "" }: TooltipRowProps) {
  return (
    <div className={`flex items-center justify-between text-slate-600 dark:text-slate-400 ${className}`}>
      <span className="flex items-center space-x-1.5">
        {swatch && <span className={`w-2 h-2 rounded-full inline-block ${swatch}`} />}
        <span>{label}:</span>
      </span>
      <span className={`font-bold ${valueClass}`}>{value}</span>
    </div>
  );
}

/** Legend pill row shown under multi-series charts. */
export function ChartLegend({ items }: { items: { label: string; swatch: string }[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
      {items.map((item) => (
        <span key={item.label} className="flex items-center space-x-1.5">
          <span className={`inline-block ${item.swatch}`} />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

/** Placeholder shown instead of a chart when a series has no recorded data. */
export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
      {message}
    </div>
  );
}

/** Shape recharts passes to a custom tooltip element. */
export interface TooltipContent<T> {
  active?: boolean;
  payload?: { payload: T; value?: number }[];
  label?: string | number;
}
