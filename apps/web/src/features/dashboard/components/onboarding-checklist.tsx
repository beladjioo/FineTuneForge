import { ArrowRight, Circle, CircleCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Step {
  title: string;
  description: string;
  done: boolean;
  /** `null` while the feature is not shipped yet. */
  action: { label: string; href: Route } | null;
}

export function OnboardingChecklist({
  hfConnected,
  hasReadyDataset,
}: {
  hfConnected: boolean;
  hasReadyDataset: boolean;
}) {
  const steps: Step[] = [
    {
      title: "Connecter Hugging Face",
      description: "Votre token permet de publier vos modèles et Spaces sur votre compte.",
      done: hfConnected,
      action: { label: "Connecter", href: "/settings" },
    },
    {
      title: "Importer un dataset",
      description: "Texte, conversations ou paires question/réponse (.txt, .jsonl, .csv).",
      done: hasReadyDataset,
      action: { label: "Importer", href: "/datasets/new" },
    },
    {
      title: "Lancer un fine-tuning",
      description: "Choisissez un modèle (Llama, Qwen, Gemma…) et un preset LoRA.",
      done: false,
      action: null,
    },
    {
      title: "Évaluer et déployer",
      description: "Comparez avant/après puis déployez une Space et une API en un clic.",
      done: false,
      action: null,
    },
  ];
  const completed = steps.filter((step) => step.done).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Premiers pas</CardTitle>
        <CardDescription>
          {completed} / {steps.length} étapes terminées
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {steps.map((step) => (
            <li key={step.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              {step.done ? (
                <CircleCheck
                  className="mt-0.5 size-5 shrink-0 text-emerald-600"
                  aria-label="Terminé"
                />
              ) : (
                <Circle
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground/50"
                  aria-label="À faire"
                />
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p
                  className={cn(
                    "font-medium text-sm",
                    step.done && "text-muted-foreground line-through",
                  )}
                >
                  {step.title}
                </p>
                <p className="text-muted-foreground text-sm">{step.description}</p>
              </div>
              {step.action === null ? (
                <Badge variant="secondary">Bientôt</Badge>
              ) : step.done ? null : (
                <Button asChild size="sm" variant="outline">
                  <Link href={step.action.href}>
                    {step.action.label}
                    <ArrowRight />
                  </Link>
                </Button>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
