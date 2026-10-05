import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once at boot.
 * Never import this from client components: secrets must stay on the server.
 */

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => value === "true" || value === "1");

const base64Key32 = z
  .string()
  .min(1, "ENCRYPTION_KEY is required (openssl rand -base64 32)")
  .refine((value) => Buffer.from(value, "base64").length === 32, {
    message: "ENCRYPTION_KEY must be 32 bytes encoded in base64 (openssl rand -base64 32)",
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z.url(),

    BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    ENCRYPTION_KEY: base64Key32,

    GITHUB_CLIENT_ID: optionalString,
    GITHUB_CLIENT_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,

    HF_ENDPOINT: z.url().default("https://huggingface.co"),
    /** Optional managed namespace: adapters can be pushed to our own HF org. */
    HF_PLATFORM_TOKEN: optionalString,
    HF_PLATFORM_ORG: optionalString,

    TRAINING_PROVIDER: z.enum(["simulated", "local", "modal"]).default("simulated"),
    ALLOW_SIMULATED_TRAINING: booleanString,
    /** Base URL of the trainer API (local FastAPI server or Modal web endpoint). */
    TRAINER_URL: z.url().optional(),
    /** web → trainer authentication (Bearer). */
    TRAINER_API_SECRET: optionalString,
    /** trainer → web callback signatures (HMAC). */
    TRAINER_CALLBACK_SECRET: optionalString,
    /** Public base URL the trainer calls back (defaults to APP_URL; use a tunnel for Modal in dev). */
    TRAINER_CALLBACK_BASE_URL: z.url().optional(),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(".data/storage"),
    S3_ENDPOINT: optionalString,
    S3_REGION: z.string().default("us-east-1"),
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: booleanString,
  })
  .superRefine((env, ctx) => {
    const requireKey = (key: keyof typeof env, reason: string) => {
      if (!env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is required ${reason}` });
      }
    };

    if (env.STORAGE_DRIVER === "s3") {
      for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
        requireKey(key, "when STORAGE_DRIVER=s3");
      }
    }

    if (env.TRAINING_PROVIDER === "simulated") {
      if (env.NODE_ENV === "production" && !env.ALLOW_SIMULATED_TRAINING) {
        ctx.addIssue({
          code: "custom",
          path: ["TRAINING_PROVIDER"],
          message:
            "simulated training is disabled in production (set ALLOW_SIMULATED_TRAINING=true for demos)",
        });
      }
    } else {
      for (const key of ["TRAINER_URL", "TRAINER_API_SECRET", "TRAINER_CALLBACK_SECRET"] as const) {
        requireKey(key, `when TRAINING_PROVIDER=${env.TRAINING_PROVIDER}`);
      }
    }

    if (Boolean(env.HF_PLATFORM_TOKEN) !== Boolean(env.HF_PLATFORM_ORG)) {
      ctx.addIssue({
        code: "custom",
        path: ["HF_PLATFORM_ORG"],
        message: "HF_PLATFORM_TOKEN and HF_PLATFORM_ORG must be set together",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function parseEnv(): Env {
  // Escape hatch for tooling that imports server modules without a real environment
  // (e.g. a CI `next build`). Runtime code paths will still fail loudly on missing values.
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    return process.env as unknown as Env;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}\nSee apps/web/.env.example.`);
  }
  return result.data;
}

export const env = parseEnv();
