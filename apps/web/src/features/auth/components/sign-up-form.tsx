"use client";

import { LoaderCircle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "../errors";
import type { SocialProvider } from "../providers";
import { SocialSignIn } from "./social-sign-in";

export function SignUpForm({
  callbackUrl,
  socialProviders,
}: {
  callbackUrl: string;
  socialProviders: SocialProvider[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);

    startTransition(async () => {
      const { error } = await authClient.signUp.email({
        name: String(form.get("name")).trim(),
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
      if (error) {
        setError(authErrorMessage(error));
        return;
      }
      router.push(callbackUrl as Route);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <SocialSignIn providers={socialProviders} callbackUrl={callbackUrl} />
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="name">Nom</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-muted-foreground text-xs">
            8 caractères minimum.
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : null}
          Créer mon compte
        </Button>
      </form>
      <p className="text-center text-muted-foreground text-sm">
        Déjà inscrit ?{" "}
        <Link
          href={{ pathname: "/sign-in", query: { callbackUrl } }}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </div>
  );
}
