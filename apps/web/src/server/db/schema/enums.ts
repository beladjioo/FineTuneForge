import { pgEnum } from "drizzle-orm/pg-core";
import { PLAN_IDS } from "../../../config/plans";
import {
  DATASET_FORMATS,
  DATASET_SOURCES,
  DATASET_STATUSES,
} from "../../../features/datasets/lib/types";
import {
  DEPLOYMENT_STATUSES,
  DEPLOYMENT_TYPES,
  VISIBILITIES,
} from "../../../features/deployments/types";
import {
  FINE_TUNE_JOB_STATUSES,
  JOB_EVENT_TYPES,
  OUTPUT_DESTINATIONS,
  TRAINING_PRESETS,
  TRAINING_PROVIDERS,
} from "../../../features/fine-tuning/types";

// Enum values are declared once in the domain modules and reused here,
// so TypeScript unions and Postgres enums can never drift apart.

export const planEnum = pgEnum("plan", PLAN_IDS);

export const datasetStatusEnum = pgEnum("dataset_status", DATASET_STATUSES);
export const datasetFormatEnum = pgEnum("dataset_format", DATASET_FORMATS);
export const datasetSourceEnum = pgEnum("dataset_source", DATASET_SOURCES);

export const fineTuneJobStatusEnum = pgEnum("fine_tune_job_status", FINE_TUNE_JOB_STATUSES);
export const trainingPresetEnum = pgEnum("training_preset", TRAINING_PRESETS);
export const trainingProviderEnum = pgEnum("training_provider", TRAINING_PROVIDERS);
export const jobEventTypeEnum = pgEnum("job_event_type", JOB_EVENT_TYPES);
export const outputDestinationEnum = pgEnum("output_destination", OUTPUT_DESTINATIONS);

export const deploymentTypeEnum = pgEnum("deployment_type", DEPLOYMENT_TYPES);
export const deploymentStatusEnum = pgEnum("deployment_status", DEPLOYMENT_STATUSES);
export const visibilityEnum = pgEnum("visibility", VISIBILITIES);
