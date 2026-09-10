"use client";

import React from "react";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme, Theme } from "@/lib/themeContext";

export const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="w-3.5 h-3.5" /> },
    { value: "system", label: "System", icon: <Laptop className="w-3.5 h-3.5" /> },
    { value: "dark", label: "Dark", icon: <Moon className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700/60 shadow-sm"
      role="radiogroup"
      aria-label="Theme selector"
    >
      {options.map((opt) => {
        const isActive = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={`flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
              isActive
                ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
            title={`Switch to ${opt.label} mode`}
            role="radio"
            aria-checked={isActive}
          >
            {opt.icon}
            <span className="hidden sm:inline text-[11px]">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
};
