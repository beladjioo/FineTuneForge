import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/server/auth";

/** Browser-side Better Auth client (same origin, so no baseURL needed). */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
