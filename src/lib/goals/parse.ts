import { isoToCivil, shiftIso } from "../utils";
import type { DistanceUnit } from "./types";

/**
 * Rule-based reading of a goal request for the offline advisor (no LLM key).
 * Covers the phrasings the app itself suggests; anything looser needs the LLM.
 */
export type ParsedGoal =
  | { tool: "create_training_plan"; args: Record<string, unknown> }
  | { tool: "create_activity_goal"; args: Record<string, unknown> }
  | { ask: string };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const pad = (n: number) => String(n).padStart(2, "0");
const monthIndex = (name: string) => MONTHS.findIndex((m) => m.startsWith(name.slice(0, 3).toLowerCase()));
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function monthRange(year: number, month: number) {
  return { startDate: `${year}-${pad(month)}-01`, endDate: `${year}-${pad(month)}-${pad(lastDay(year, month))}` };
}

/** "July 25, 2027", "25 July 2027", "2027-07-25"; a date without a year is the next time it comes around. */
function findDate(text: string, today: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const md = text.match(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, "i"));
  const dm = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?`, "i"));
  const hit = md ? { month: md[1], day: md[2], year: md[3] } : dm ? { month: dm[2], day: dm[1], year: dm[3] } : null;
  if (!hit) return null;
  const month = monthIndex(hit.month) + 1;
  const day = Number(hit.day);
  if (day < 1 || day > 31) return null;
  const { year: thisYear } = isoToCivil(today);
  let year = hit.year ? Number(hit.year) : thisYear;
  if (!hit.year && `${year}-${pad(month)}-${pad(day)}` <= today) year++;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function findPeriod(text: string, today: string): { startDate: string; endDate: string } {
  const { year, month } = isoToCivil(today);
  if (/next month/.test(text)) return month === 12 ? monthRange(year + 1, 1) : monthRange(year, month + 1);
  if (/this week|next 7 days/.test(text)) return { startDate: today, endDate: shiftIso(today, 6) };
  if (/this year/.test(text)) return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
  const named = text.match(new RegExp(`\\b${MONTH_RE}\\b(?:\\s+(\\d{4}))?`, "i"));
  if (named) {
    const m = monthIndex(named[1]) + 1;
    // A month already over means next year's.
    return monthRange(named[2] ? Number(named[2]) : m < month ? year + 1 : year, m);
  }
  return monthRange(year, month);
}

export function parseGoalRequest(raw: string, today: string, unit: DistanceUnit): ParsedGoal | null {
  const text = raw.toLowerCase();

  const race = text.match(/half[\s-]?marathon|marathon|\b10\s?k\b|\b5\s?k\b/);
  if (race && /train|plan|program|prepar|race|ready/.test(text)) {
    const distance = race[0].includes("half") ? "half" : race[0].includes("marathon") ? "marathon" : race[0].replace(/\s/g, "");
    const raceDate = findDate(text, today);
    if (!raceDate) return { ask: `Happy to build your ${race[0]} plan. **What date is the race?** (for example: "train me for a ${race[0]} on July 25, 2027")` };
    const named = raw.match(/for (?:the |my |a |an )?(.+?)(?:\s+on\b|\s+in\s+\d|,|\.|$)/i)?.[1]?.trim();
    const goalTime = text.match(/(?:sub|under|goal(?: time)?(?: of)?|finish in)\s*(\d{1,2}:\d{2}(?::\d{2})?)/)?.[1];
    const recent = text.match(/(half[\s-]?marathon|half|10\s?k|5\s?k)s?\s+(?:in|at|around|time of)\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
    return {
      tool: "create_training_plan",
      args: {
        raceName: named && named.length <= 60 ? named.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined,
        raceDate,
        distance,
        goalTime,
        ...(recent ? { recentRaceDistance: recent[1].includes("half") ? "half" : recent[1].replace(/\s/g, ""), recentRaceTime: recent[2] } : {}),
        unit: /\bkm\b|kilomet/.test(text) ? "km" : /\bmi(les?)?\b/.test(text) ? "mi" : unit,
      },
    };
  }

  // A creation verb is required: "how am I tracking on my goals?" is a question, not a request.
  if (!/\b(create|set|add|make|start|new|aim|target|challenge)\b|i want to (walk|run|hit|do|log|cover)/.test(text)) return null;
  const amount = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?\s*(?:total\s+)?(steps?|miles?|mi|km|kilomet(?:er|re)s?|workouts?|sessions?|runs?|active(?: zone)? minutes?|minutes?)\b/);
  if (!amount) return { ask: 'Tell me the target and the period, for example: *"Create a November goal of 300,000 steps"* or *"Run 50 miles in December"*.' };
  const value = Number(amount[1].replace(/,/g, "")) * (amount[2] ? 1000 : 1);
  const what = amount[3];
  const isDistance = /^(mi|km|kilomet)/.test(what);
  const metric = /step/.test(what)
    ? "steps"
    : isDistance
      ? /\brun|jog/.test(text) ? "run_distance" : "distance"
      : /workout|session/.test(what) ? "workouts" : /run/.test(what) ? "runs" : "active_minutes";
  return { tool: "create_activity_goal", args: { metric, target: value, ...(isDistance ? { unit: what.startsWith("mi") ? "mi" : "km" } : {}), ...findPeriod(text, today) } };
}
