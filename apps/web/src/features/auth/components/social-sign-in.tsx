"use client";

import { useState } from "react";
import { toast } from "sonner";
import { GitHubIcon, GoogleIcon } from "@/components/brand/provider-icons";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { SOCIAL_PROVIDER_LABELS, type SocialProvider } from "../providers";

const ICONS = { github: GitHubIcon, google: GoogleIcon } satisfies Record<SocialProvider, unknown>;

export function SocialSignIn({
  providers,
  callbackUrl,
}: {
  providers: SocialProvider[];
  callbackUrl: string;
}) {
  const [pending, setPending] = useState<SocialProvider | null>(null);
  if (providers.length === 0) return null;

  const signIn = async (provider: SocialProvider) => {
    setPending(provider);
    const { error } = await authClient.signIn.social({ provider, callbackURL: callbackUrl });
    if (error) {
      toast.error(`Connexion avec ${SOCIAL_PROVIDER_LABELS[provider]} impossible.`);
      setPending(null);
    }
    // On success the browser is redirected to the provider.
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        {providers.map((provider) => {
          const Icon = ICONS[provider];
          return (
            <Button
              key={provider}
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => signIn(provider)}
            >
              <Icon className="size-4" />
              Continuer avec {SOCIAL_PROVIDER_LABELS[provider]}
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        ou avec votre email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
