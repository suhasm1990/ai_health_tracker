import type { ReactNode } from "react";

/**
 * Minimal markdown for assistant output and briefings. Everything renders as
 * React nodes, never as raw HTML, so model output cannot inject markup.
 */

export interface InlineStyles {
  strong?: string;
  em?: string;
  code?: string;
}

const DEFAULT_INLINE: Required<InlineStyles> = {
  strong: "font-semibold text-slate-900 dark:text-white",
  em: "text-slate-500 dark:text-slate-400 italic",
  code: "px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded text-[11px] font-mono",
};

const INLINE_TOKEN = /(\*\*.+?\*\*|\*.+?\*|`.+?`)/g;

/** **bold**, *italic* and `code` spans. */
export function renderInline(text: string, styles: InlineStyles = {}): ReactNode[] {
  const s = { ...DEFAULT_INLINE, ...styles };
  return text.split(INLINE_TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i} className={s.strong}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className={s.code}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i} className={s.em}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const BODY = "text-slate-700 dark:text-slate-300 my-0.5 leading-relaxed";

/** Headings (###, ####), bullet and numbered lists, blockquotes and paragraphs. */
export function renderMarkdown(content: string): ReactNode[] {
  return content.split("\n").map((raw, i) => {
    const line = raw.trim();
    if (!line) return <div key={i} className="h-1.5" />;
    if (line.startsWith("#### ")) return <h4 key={i} className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-2 mb-0.5">{line.slice(5)}</h4>;
    if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-bold text-slate-900 dark:text-white mt-2 mb-1">{line.slice(4)}</h3>;
    if (line.startsWith("> ")) {
      return <blockquote key={i} className="border-l-2 border-emerald-500 pl-2.5 py-0.5 my-1 text-slate-600 dark:text-slate-400 italic text-[11px]">{renderInline(line.slice(2))}</blockquote>;
    }
    if (/^[-*] /.test(line)) return <li key={i} className={`ml-4 list-disc ${BODY}`}>{renderInline(line.slice(2))}</li>;
    if (/^\d+\. /.test(line)) return <li key={i} className={`ml-4 list-decimal ${BODY}`}>{renderInline(line.replace(/^\d+\. /, ""))}</li>;
    return <p key={i} className={BODY}>{renderInline(line)}</p>;
  });
}
