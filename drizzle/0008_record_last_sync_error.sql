-- Nullable columns with no default: Postgres adds them without rewriting the table, existing rows read as NULL,
-- and IF NOT EXISTS makes a re-run harmless. Code that predates this migration never reads them.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_sync_error_detail" text;
