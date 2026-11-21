import type { ToolContext, ToolResult } from "../llm/tools";
import type { ToolDefinition } from "../llm/types";
import { HABIT_KEYS, HABITS, isHabit, MEMORY_CATEGORIES, type MemoryCategory } from "../journal/habits";
import { loadJournal } from "../journal/service";
import { isValidIsoDate, shiftIso, todayIso } from "../utils";
import { coachStore } from "./store";

export const COACH_TOOLS: ToolDefinition[] = [
  {
    name: "remember_fact",
    description:
      "Save a lasting fact about the user so future conversations can use it: an injury or condition, their schedule, a preference (e.g. morning runs, no gym), a motivation or a life event. Call it when the user shares something that will still matter next week, or says 'remember'. Do not save one-off daily details (use log_habit for those) or anything they ask you not to keep.",
    parameters: {
      type: "object",
      properties: {
        fact: { type: "string", description: "The fact in one short third-person sentence, e.g. 'Has a sore left knee since November; avoids downhill running.'" },
        category: { type: "string", description: "Kind of fact", enum: MEMORY_CATEGORIES },
      },
      required: ["fact", "category"],
    },
  },
  {
    name: "forget_fact",
    description: "Delete a saved fact about the user, by its id from the memory list in the system prompt. Use when they say it's no longer true or ask you to forget it.",
    parameters: { type: "object", properties: { id: { type: "string", description: "The memory id, e.g. mem_abc123" } }, required: ["id"] },
  },
  {
    name: "log_habit",
    description: `Log a habit in the user's journal for a day, so the app can learn what affects their recovery. Use when they mention one, e.g. "had 2 beers last night", "coffee at 4pm", "stressful day". Habits: ${HABIT_KEYS.map((k) => `${k} (${HABITS[k].question})`).join(", ")}. 'Last night' usually means yesterday's date.`,
    parameters: {
      type: "object",
      properties: {
        habit: { type: "string", description: "Habit key", enum: HABIT_KEYS },
        date: { type: "string", description: "Day it happened, YYYY-MM-DD (default today). Up to 14 days back." },
        amount: { type: "number", description: "How much, when it has a unit (drinks, cups, minutes)" },
      },
      required: ["habit"],
    },
  },
  {
    name: "get_journal_insights",
    description: "Get what logged habits do to the user's next-morning HRV, resting heart rate and sleep, plus recent journal entries. Use for 'what affects my sleep/recovery', 'does alcohol hurt my HRV', or to show habit patterns.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

type Args = Record<string, unknown>;

export const coachHandlers: Record<string, (args: Args, ctx: ToolContext) => Promise<ToolResult>> = {
  async remember_fact(args, ctx) {
    const fact = typeof args.fact === "string" ? args.fact.trim() : "";
    const category = (MEMORY_CATEGORIES as string[]).includes(String(args.category)) ? (args.category as MemoryCategory) : "other";
    const summary = { name: "remember_fact", label: "Saved to Coach Memory", args };
    if (fact.length < 3) return { data: { saved: false, error: "fact is empty" }, summary: { ...summary, resultSummary: "Nothing to save" } };
    const memory = await coachStore(ctx.state, ctx.clientTz, ctx.guestId).remember(category, fact);
    return { data: { saved: true, memory }, summary: { ...summary, resultSummary: memory.text } };
  },

  async forget_fact(args, ctx) {
    const id = typeof args.id === "string" ? args.id : "";
    const forgotten = id ? await coachStore(ctx.state, ctx.clientTz, ctx.guestId).forget(id) : false;
    return { data: { forgotten, ...(forgotten ? {} : { error: "No memory with that id" }) }, summary: { name: "forget_fact", label: "Removed from Coach Memory", args, resultSummary: forgotten ? "Forgotten" : "Not found" } };
  },

  async log_habit(args, ctx) {
    const today = ctx.clientDate ?? todayIso(ctx.clientTz);
    const date = isValidIsoDate(args.date) && args.date <= today && args.date >= shiftIso(today, -14) ? args.date : today;
    const summary = { name: "log_habit", label: "Logged to Journal", args };
    if (!isHabit(args.habit)) return { data: { saved: false, error: `habit must be one of ${HABIT_KEYS.join(", ")}` }, summary: { ...summary, resultSummary: "Unknown habit" } };
    const amount = typeof args.amount === "number" && args.amount > 0 && args.amount < 100 ? args.amount : null;
    await coachStore(ctx.state, ctx.clientTz, ctx.guestId).log({ date, habit: args.habit, amount, note: null });
    const { label, unit } = HABITS[args.habit];
    return { data: { saved: true, habit: label, date, amount }, summary: { ...summary, resultSummary: `${label}${amount && unit ? ` (${amount} ${unit})` : ""} on ${date}` } };
  },

  async get_journal_insights(args, ctx) {
    const journal = await loadJournal(ctx);
    const ready = journal.insights.filter((i) => i.ready);
    return {
      data: {
        insights: journal.insights.map(({ label, headline, ready, yesMornings, noMornings, effects }) => ({ habit: label, headline, ready, morningsAfterHabit: yesMornings, morningsWithout: noMornings, effects })),
        recentEntries: journal.recent.map((e) => ({ date: e.date, habit: HABITS[e.habit].label, amount: e.amount })),
        method: "Mornings after a day the habit was logged vs mornings after days it wasn't, since the first journal entry. Needs 3 of each. A correlation, not proof of cause.",
      },
      summary: { name: "get_journal_insights", label: "Read Habit Journal", args, resultSummary: ready.length ? ready.map((i) => i.headline).join(" ") : `${journal.recent.length} recent entries, no insights ready yet` },
    };
  },
};
