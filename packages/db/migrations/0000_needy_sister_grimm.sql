CREATE TABLE "maimemo_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"credential_type" text DEFAULT 'MANUAL' NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"refresh_ciphertext" text,
	"refresh_iv" text,
	"refresh_auth_tag" text,
	"key_version" integer DEFAULT 1 NOT NULL,
	"token_status" text DEFAULT 'ACTIVE' NOT NULL,
	"token_expires_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"result" text NOT NULL,
	"detail" jsonb,
	"client_ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"allow_interpretation" boolean DEFAULT false NOT NULL,
	"allow_phrase" boolean DEFAULT false NOT NULL,
	"allow_note" boolean DEFAULT false NOT NULL,
	"allow_notepad" boolean DEFAULT false NOT NULL,
	"allow_study_plan" boolean DEFAULT false NOT NULL,
	"daily_quota_used" integer DEFAULT 0 NOT NULL,
	"quota_reset_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"union_id" text,
	"open_id_web" text,
	"open_id_mp" text,
	"maimemo_sub" text,
	"nickname" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_union_id_unique" UNIQUE("union_id"),
	CONSTRAINT "users_open_id_web_unique" UNIQUE("open_id_web"),
	CONSTRAINT "users_open_id_mp_unique" UNIQUE("open_id_mp"),
	CONSTRAINT "users_maimemo_sub_unique" UNIQUE("maimemo_sub")
);
--> statement-breakpoint
CREATE TABLE "daily_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"review_date" date NOT NULL,
	"content" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_review_unique" UNIQUE("user_id","review_date")
);
--> statement-breakpoint
CREATE TABLE "daily_study_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"finished" integer NOT NULL,
	"total" integer NOT NULL,
	"study_time_ms" bigint NOT NULL,
	"is_reliable" boolean DEFAULT true NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_snapshot_unique" UNIQUE("user_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "forget_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"voc_id" text NOT NULL,
	"spelling" text NOT NULL,
	"event_date" date NOT NULL,
	"response" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forget_event_unique" UNIQUE("user_id","voc_id","event_date","source")
);
--> statement-breakpoint
CREATE TABLE "periodic_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_type" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"content" jsonb NOT NULL,
	"data_completeness" numeric(3, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "periodic_report_unique" UNIQUE("user_id","period_type","period_start")
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scene" text NOT NULL,
	"model" text NOT NULL,
	"input_digest" text NOT NULL,
	"output" jsonb,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"accepted" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_write_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"scene" text NOT NULL,
	"voc_id" text NOT NULL,
	"spelling" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"written_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_item_idempotent" UNIQUE("user_id","job_type","voc_id","scene")
);
--> statement-breakpoint
CREATE TABLE "content_write_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_type" text NOT NULL,
	"scene" text NOT NULL,
	"total_count" integer NOT NULL,
	"done_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"quota_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confusion_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"words" text[] NOT NULL,
	"reason" text,
	"score" numeric(6, 4),
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notepad_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"notepad_id" text NOT NULL,
	"title" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notepad_mapping_unique" UNIQUE("user_id","notepad_id")
);
--> statement-breakpoint
ALTER TABLE "maimemo_credentials" ADD CONSTRAINT "maimemo_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_write_items" ADD CONSTRAINT "content_write_items_job_id_content_write_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."content_write_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operation_logs_user_idx" ON "operation_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "forget_events_user_date_idx" ON "forget_events" USING btree ("user_id","event_date");--> statement-breakpoint
CREATE INDEX "ai_generations_user_idx" ON "ai_generations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "content_items_job_idx" ON "content_write_items" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "content_jobs_user_idx" ON "content_write_jobs" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "confusion_groups_user_idx" ON "confusion_groups" USING btree ("user_id");