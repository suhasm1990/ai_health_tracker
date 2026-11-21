import type { ReactNode } from "react";

interface RingProps {
  /** 0-100 */
  value: number | null;
  size?: number;
  stroke?: number;
  /** Tailwind text colour class for the progress arc, e.g. "text-emerald-500". */
  colorClass: string;
  /** Optional target band, 0-100 on the same scale, drawn under the arc. */
  band?: [number, number];
  children?: ReactNode;
  label: string;
}

/** A single-value ring gauge that starts at 12 o'clock. */
export function Ring({ value, size = 76, stroke = 8, colorClass, band, children, label }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = (from: number, to: number) => ({ strokeDasharray: `${(Math.max(0, to - from) / 100) * c} ${c}`, strokeDashoffset: -(from / 100) * c });
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-800" />
        {band && <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={`${colorClass} opacity-25`} stroke="currentColor" style={arc(band[0], band[1])} />}
        {value !== null && value > 0 && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke="currentColor" className={`${colorClass} transition-[stroke-dasharray] duration-700 ease-out`} style={arc(0, Math.min(100, value))} />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
