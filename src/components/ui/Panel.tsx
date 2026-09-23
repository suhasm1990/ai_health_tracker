import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Standard dashboard card surface. */
export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={`bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs transition-colors duration-200 ${className}`}
    >
      {children}
    </section>
  );
}

interface PanelHeaderProps {
  icon: LucideIcon;
  /** Colour classes for the icon chip, e.g. "bg-rose-500/10 text-rose-500 border-rose-500/20". */
  iconClass: string;
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned controls. */
  children?: ReactNode;
}

export function PanelHeader({ icon: Icon, iconClass, title, subtitle, children }: PanelHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
      <div className="flex items-center space-x-2.5">
        <div className={`p-1.5 sm:p-2 rounded-xl border ${iconClass}`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
