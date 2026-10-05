import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./columns";
import { deploymentStatusEnum, deploymentTypeEnum, visibilityEnum } from "./enums";
import { fineTuneJobs } from "./fine-tune-jobs";

/**
 * A fine-tuned model exposed to the world (Phase 3): a Gradio Space on Hugging Face
 * and/or an inference endpoint, plus a public share page at /m/{slug}.
 */
export const deployedModels = pgTable(
  "deployed_models",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => fineTuneJobs.id, { onDelete: "restrict" }),
    /** URL-safe identifier for the share / documentation page. */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),

    type: deploymentTypeEnum("type").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("public"),
    status: deploymentStatusEnum("status").notNull().default("pending"),

    /** e.g. "alice/support-bot" (Space id or endpoint name). */
    hfRepoId: text("hf_repo_id").notNull(),
    hardware: text("hardware"),
    spaceUrl: text("space_url"),
    apiUrl: text("api_url"),
    error: text("error"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("deployed_models_user_id_idx").on(table.userId),
    index("deployed_models_job_id_idx").on(table.jobId),
  ],
);

export type DeployedModel = typeof deployedModels.$inferSelect;
export type NewDeployedModel = typeof deployedModels.$inferInsert;
