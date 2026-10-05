import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { createdAt, id, updatedAt } from "./columns";

/**
 * A user's Hugging Face access token, encrypted at rest (AES-256-GCM, see
 * src/server/crypto/secrets.ts). Kept out of `users` so the secret is never loaded
 * with the session and only the code that really needs it can read it.
 */
export const hfCredentials = pgTable("hf_credentials", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  encryptedToken: text("encrypted_token").notNull(),
  /** Non-sensitive hint displayed in the UI, e.g. "hf_…a1b2". */
  tokenHint: text("token_hint").notNull(),
  /** Token role reported by Hugging Face: "read", "write" or "fineGrained". */
  tokenRole: text("token_role").notNull(),
  hfUsername: text("hf_username").notNull(),
  validatedAt: timestamp("validated_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
