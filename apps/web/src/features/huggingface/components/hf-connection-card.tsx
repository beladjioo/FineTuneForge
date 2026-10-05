"use client";

import { ExternalLink, KeyRound, LoaderCircle, ShieldCheck, Unplug } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";
import { connectHuggingFaceAction, disconnectHuggingFaceAction } from "../actions";

interface Connection {
  hfUsername: string;
  tokenHint: string;
  tokenRole: string;
  validatedAt: Date;
}

const NEW_TOKEN_URL = "https://huggingface.co/settings/tokens/new?tokenType=write";

export function HfConnectionCard({ connection }: { connection: Connection | null }) {
  const [showForm, setShowForm] = useState(connection === null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const token = String(new FormData(form).get("token") ?? "");
    setError(null);

    startTransition(async () => {
      const result = await connectHuggingFaceAction({ token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setShowForm(false);
      toast.success(`Compte Hugging Face @${result.data.hfUsername} connecté.`);
    });
  };

  const onDisconnect = () =>
    startTransition(async () => {
      const result = await disconnectHuggingFaceAction({});
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setShowForm(true);
      toast.success("Compte Hugging Face déconnecté.");
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Hugging Face
          {connection ? <Badge variant="success">Connecté</Badge> : null}
        </CardTitle>
        <CardDescription>
          Utilisé pour publier vos modèles fine-tunés et créer vos Spaces sur votre propre compte.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connection ? (
          <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-1 text-sm">
              <p>
                Connecté en tant que{" "}
                <a
                  href={`https://huggingface.co/${connection.hfUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium underline-offset-4 hover:underline"
                >
                  @{connection.hfUsername}
                </a>
              </p>
              <p className="text-muted-foreground">
                Token <code className="font-mono">{connection.tokenHint}</code> · rôle{" "}
                {connection.tokenRole} · vérifié le {formatDateTime(connection.validatedAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm((value) => !value)}>
                <KeyRound /> Remplacer
              </Button>
              <Button variant="outline" size="sm" onClick={onDisconnect} disabled={isPending}>
                <Unplug /> Déconnecter
              </Button>
            </div>
          </div>
        ) : null}

        {showForm ? (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="hf-token">Token d'accès (rôle « Write »)</Label>
              <Input
                id="hf-token"
                name="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="hf_…"
                required
              />
              <p className="text-muted-foreground text-xs">
                <a
                  href={NEW_TOKEN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  Créer un token sur huggingface.co <ExternalLink className="size-3" />
                </a>
              </p>
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending ? <LoaderCircle className="animate-spin" /> : null}
                Vérifier et enregistrer
              </Button>
              <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <ShieldCheck className="size-3.5" /> Chiffré (AES-256-GCM), jamais réaffiché.
              </p>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
