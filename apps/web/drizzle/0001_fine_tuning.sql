CREATE TYPE "public"."output_destination" AS ENUM('user', 'platform');--> statement-breakpoint
ALTER TYPE "public"."training_provider" ADD VALUE 'simulated';--> statement-breakpoint
ALTER TABLE "fine_tune_job_events" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "fine_tune_jobs" ADD COLUMN "output_destination" "output_destination" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "fine_tune_jobs" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "fine_tune_job_events_job_id_seq_idx" ON "fine_tune_job_events" USING btree ("job_id","seq");