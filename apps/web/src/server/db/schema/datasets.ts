import { bigint, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type {
  DatasetReport,
  DatasetStats,
  TrainingSample,
} from "../../../features/datasets/lib/types";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./columns";
import { datasetFormatEnum, datasetSourceEnum, datasetStatusEnum } from "./enums";

/**
 * An uploaded training dataset.
 *
 * Lifecycle: `uploading` (row created, browser uploads straight to storage)
 * → `processing` (server parses & validates) → `ready` | `failed`.
 *
 * Two objects live in storage: the original file, untouched, and the normalized
 * JSONL (one canonical sample per line) that the trainer consumes.
 */
export const datasets = pgTable(
  "datasets",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    status: datasetStatusEnum("status").notNull().default("uploading"),
    source: datasetSourceEnum("source").notNull(),
    /** Null until the dataset has been analyzed. */
    format: datasetFormatEnum("format"),

    originalFilename: text("original_filename").notNull(),
    originalFileKey: text("original_file_key").notNull(),
    normalizedFileKey: text("normalized_file_key"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),

    /** Number of valid samples after normalization and de-duplication. */
    sampleCount: integer("sample_count").notNull().default(0),
    stats: jsonb("stats").$type<DatasetStats>(),
    report: jsonb("report").$type<DatasetReport>(),
    /** First samples (truncated) so pages render without touching storage. */
    preview: jsonb("preview").$type<TrainingSample[]>(),
    /** Unexpected processing failure (validation problems live in `report`). */
    error: text("error"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("datasets_user_id_created_at_idx").on(table.userId, table.createdAt)],
);

export type Dataset = typeof datasets.$inferSelect;
export type NewDataset = typeof datasets.$inferInsert;
