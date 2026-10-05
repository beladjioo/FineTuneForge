CREATE TYPE "public"."dataset_format" AS ENUM('text', 'prompt_completion', 'chat');--> statement-breakpoint
CREATE TYPE "public"."dataset_source" AS ENUM('file', 'paste');--> statement-breakpoint
CREATE TYPE "public"."dataset_status" AS ENUM('uploading', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('pending', 'building', 'running', 'sleeping', 'stopped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."deployment_type" AS ENUM('space', 'inference_endpoint');--> statement-breakpoint
CREATE TYPE "public"."fine_tune_job_status" AS ENUM('queued', 'preparing', 'training', 'evaluating', 'uploading', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_event_type" AS ENUM('log', 'metric', 'status');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "public"."training_preset" AS ENUM('beginner', 'intermediate', 'advanced', 'custom');--> statement-breakpoint
CREATE TYPE "public"."training_provider" AS ENUM('modal', 'runpod', 'local');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('public', 'private');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "dataset_status" DEFAULT 'uploading' NOT NULL,
	"source" "dataset_source" NOT NULL,
	"format" "dataset_format",
	"original_filename" text NOT NULL,
	"original_file_key" text NOT NULL,
	"normalized_file_key" text,
	"size_bytes" bigint NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"stats" jsonb,
	"report" jsonb,
	"preview" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployed_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "deployment_type" NOT NULL,
	"visibility" "visibility" DEFAULT 'public' NOT NULL,
	"status" "deployment_status" DEFAULT 'pending' NOT NULL,
	"hf_repo_id" text NOT NULL,
	"hardware" text,
	"space_url" text,
	"api_url" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployed_models_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "fine_tune_job_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fine_tune_job_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job_id" uuid NOT NULL,
	"type" "job_event_type" NOT NULL,
	"message" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fine_tune_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_model_id" text NOT NULL,
	"preset" "training_preset" NOT NULL,
	"hyperparameters" jsonb NOT NULL,
	"status" "fine_tune_job_status" DEFAULT 'queued' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"metrics" jsonb,
	"evaluation" jsonb,
	"provider" "training_provider" NOT NULL,
	"provider_run_id" text,
	"orchestrator_run_id" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"output_repo_id" text,
	"output_repo_private" boolean DEFAULT false NOT NULL,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hf_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"encrypted_token" text NOT NULL,
	"token_hint" text NOT NULL,
	"token_role" text NOT NULL,
	"hf_username" text NOT NULL,
	"validated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hf_credentials_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployed_models" ADD CONSTRAINT "deployed_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployed_models" ADD CONSTRAINT "deployed_models_job_id_fine_tune_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."fine_tune_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine_tune_job_events" ADD CONSTRAINT "fine_tune_job_events_job_id_fine_tune_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."fine_tune_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine_tune_jobs" ADD CONSTRAINT "fine_tune_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine_tune_jobs" ADD CONSTRAINT "fine_tune_jobs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hf_credentials" ADD CONSTRAINT "hf_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "datasets_user_id_created_at_idx" ON "datasets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "deployed_models_user_id_idx" ON "deployed_models" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "deployed_models_job_id_idx" ON "deployed_models" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "fine_tune_job_events_job_id_id_idx" ON "fine_tune_job_events" USING btree ("job_id","id");--> statement-breakpoint
CREATE INDEX "fine_tune_jobs_user_id_created_at_idx" ON "fine_tune_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "fine_tune_jobs_dataset_id_idx" ON "fine_tune_jobs" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "fine_tune_jobs_status_idx" ON "fine_tune_jobs" USING btree ("status");