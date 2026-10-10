CREATE TABLE "daily_metrics" (
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"active_zone_minutes" integer DEFAULT 0 NOT NULL,
	"calories_burned" integer DEFAULT 0 NOT NULL,
	"distance_km" real DEFAULT 0 NOT NULL,
	"resting_heart_rate" integer,
	"heart_rate_variability" integer,
	"sleep_minutes" integer DEFAULT 0 NOT NULL,
	"sleep_score" integer DEFAULT 0 NOT NULL,
	"readiness_score" integer,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_metrics_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"display_name" text,
	"refresh_token_enc" text,
	"time_zone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	"backfilled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"date" date NOT NULL,
	"activity_type" text NOT NULL,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workouts_user_date_idx" ON "workouts" USING btree ("user_id","date");