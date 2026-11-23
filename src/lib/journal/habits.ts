/** Habits people can log, by tap or by telling the coach. Keys are stored; labels are for display. */
export const HABITS = {
  alcohol: { label: "Alcohol", question: "Drank alcohol", unit: "drinks", icon: "wine" },
  late_caffeine: { label: "Late caffeine", question: "Caffeine after 2 PM", unit: "cups", icon: "coffee" },
  late_meal: { label: "Late meal", question: "Ate within 2 hours of bed", unit: null, icon: "utensils" },
  screens_in_bed: { label: "Screens in bed", question: "Used a phone or screen in bed", unit: null, icon: "smartphone" },
  stress: { label: "High stress", question: "A stressful day", unit: null, icon: "zap" },
  late_workout: { label: "Late workout", question: "Trained within 3 hours of bed", unit: null, icon: "dumbbell" },
  travel: { label: "Travel", question: "Travelled or changed time zones", unit: null, icon: "plane" },
  meditation: { label: "Meditation", question: "Meditated or did breathwork", unit: "min", icon: "leaf" },
  sauna: { label: "Sauna or hot bath", question: "Sauna or a hot bath", unit: null, icon: "flame" },
  sick: { label: "Feeling sick", question: "Felt ill or run down", unit: null, icon: "thermometer" },
} as const;

export type HabitKey = keyof typeof HABITS;
export type HabitIcon = (typeof HABITS)[HabitKey]["icon"];
export const HABIT_KEYS = Object.keys(HABITS) as HabitKey[];
export const isHabit = (value: unknown): value is HabitKey => typeof value === "string" && value in HABITS;

export interface JournalEntry {
  /** The day the habit happened; it is compared with the NEXT morning's recovery. */
  date: string;
  habit: HabitKey;
  amount: number | null;
  note: string | null;
}

export type MemoryCategory = "goal" | "injury" | "health" | "schedule" | "preference" | "other";
export const MEMORY_CATEGORIES: MemoryCategory[] = ["goal", "injury", "health", "schedule", "preference", "other"];

export interface CoachMemory {
  id: string;
  category: MemoryCategory;
  text: string;
  createdAt: string;
}

/** Chat tools whose success changes the journal card; the client refetches after them. */
export const JOURNAL_MUTATION_TOOLS: readonly string[] = ["remember_fact", "forget_fact", "log_habit"];
