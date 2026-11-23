import { date, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp } from "drizzle-orm/pg-core";
import type { Goal } from "../goals/types";
import type { SyncErrorKind } from "../syncErrors";
import type { DailyMetricSummary, HealthMetricsPayload, WorkoutSession } from "../types";

const tstz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  /** Google subject id */
  id: text("id").primaryKey(),
  email: text("email").notNull().default(""),
  displayName: text("display_name"),
  /** AES-256-GCM encrypted refresh token */
  refreshTokenEnc: text("refresh_token_enc"),
  /** IANA time zone */
  timeZone: text("time_zone"),
  createdAt: tstz("created_at").notNull().defaultNow(),
  updatedAt: tstz("updated_at").notNull().defaultNow(),
  lastSyncedAt: tstz("last_synced_at"),
  backfilledAt: tstz("backfilled_at"),
  /** When the nightly job last started on this user, whatever the outcome; tells a failing sync from a job that never ran. */
  lastSyncAttemptAt: tstz("last_sync_attempt_at"),
  /** Why the latest attempt failed; cleared when a sync succeeds. */
  lastSyncError: text("last_sync_error").$type<SyncErrorKind>(),
  lastSyncErrorAt: tstz("last_sync_error_at"),
  /** Short error message for the admin, never a token. */
  lastSyncErrorDetail: text("last_sync_error_detail"),
});

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    steps: integer("steps").notNull().default(0),
    activeZoneMinutes: integer("active_zone_minutes").notNull().default(0),
    caloriesBurned: integer("calories_burned").notNull().default(0),
    distanceKm: real("distance_km").notNull().default(0),
    restingHeartRate: integer("resting_heart_rate"),
    heartRateVariability: integer("heart_rate_variability"),
    sleepMinutes: integer("sleep_minutes").notNull().default(0),
    sleepScore: integer("sleep_score").notNull().default(0),
    readinessScore: integer("readiness_score"),
    data: jsonb("data").$type<DailyMetricSummary>().notNull(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })]
);

export const workouts = pgTable(
  "workouts",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    activityType: text("activity_type").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    data: jsonb("data").$type<WorkoutSession>().notNull(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("workouts_user_date_idx").on(t.userId, t.date)]
);

/** Last live dashboard payload per user and day, shared across server instances to avoid refetching from Google. */
export const liveSnapshots = pgTable(
  "live_snapshots",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    payload: jsonb("payload").$type<HealthMetricsPayload>().notNull(),
    fetchedAt: tstz("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })]
);

/** Training programs and activity goals; the full goal (including a generated plan) lives in `data`. */
export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("active"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    data: jsonb("data").$type<Goal>().notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
    updatedAt: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [index("goals_user_status_idx").on(t.userId, t.status)]
);

/** Lasting facts the coach keeps about a user (an injury, a schedule, a preference), shown to them and editable. */
export const coachMemories = pgTable(
  "coach_memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    text: text("text").notNull(),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [index("coach_memories_user_idx").on(t.userId)]
);

/** One logged habit per user, day and habit (e.g. alcohol on 2026-11-20), used to find what affects recovery. */
export const journalEntries = pgTable(
  "journal_entries",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    habit: text("habit").notNull(),
    amount: real("amount"),
    note: text("note"),
    createdAt: tstz("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date, t.habit] })]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type DailyMetricRow = typeof dailyMetrics.$inferSelect;
export type NewDailyMetricRow = typeof dailyMetrics.$inferInsert;
export type WorkoutRow = typeof workouts.$inferSelect;
export type NewWorkoutRow = typeof workouts.$inferInsert;
