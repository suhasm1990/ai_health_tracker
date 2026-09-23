import type { LucideIcon } from "lucide-react";

export interface ViewOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface ViewToggleProps<T extends string> {
  value: T;
  options: ViewOption<T>[];
  onChange: (value: T) => void;
  /** Background class for the active segment. */
  activeClass?: string;
}

/** Segmented control for switching chart views. */
export function ViewToggle<T extends string>({ value, options, onChange, activeClass = "bg-emerald-600" }: ViewToggleProps<T>) {
  return (
    <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-lg p-1 border border-slate-200 dark:border-slate-700/60" role="tablist">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
            value === v ? `${activeClass} text-white shadow-xs` : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
