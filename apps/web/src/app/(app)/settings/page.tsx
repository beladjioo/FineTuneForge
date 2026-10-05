import { Check } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlan, PLANS, type PlanDefinition } from "@/config/plans";
import { HfConnectionCard } from "@/features/huggingface/components/hf-connection-card";
import { getHuggingFaceConnection } from "@/features/huggingface/server/credentials";
import { formatBytes } from "@/lib/utils";
import { requireSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Paramètres" };

function planFeatures(plan: PlanDefinition): string[] {
  const { limits } = plan;
  return [
    limits.fineTunesPerMonth === null
      ? "Fine-tunes illimités"
      : `${limits.fineTunesPerMonth} fine-tune par mois`,
    limits.privateDeployments ? "Spaces privées ou publiques" : "Spaces publiques uniquement",
    `${limits.maxDatasets} datasets, ${formatBytes(limits.maxDatasetBytes)} par fichier`,
  ];
}

export default async function SettingsPage() {
  const { user } = await requireSession();
  const currentPlan = getPlan(user.plan);
  const hfConnection = await getHuggingFaceConnection(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramètres"
        description="Votre compte, vos intégrations et votre abonnement."
      />

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Nom</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <HfConnectionCard connection={hfConnection} />

      <Card>
        <CardHeader>
          <CardTitle>Abonnement</CardTitle>
          <CardDescription>Le paiement en ligne arrive bientôt.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {Object.values(PLANS).map((plan) => {
            const isCurrent = plan.id === currentPlan.id;
            return (
              <div key={plan.id} className="flex flex-col gap-4 rounded-lg border p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-muted-foreground text-sm">{plan.tagline}</p>
                  </div>
                  {isCurrent ? <Badge>Plan actuel</Badge> : null}
                </div>
                <p className="font-semibold text-2xl">
                  {plan.priceMonthlyEur} €
                  <span className="font-normal text-muted-foreground text-sm"> / mois</span>
                </p>
                <ul className="space-y-1.5 text-sm">
                  {planFeatures(plan).map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="size-4 text-emerald-600" aria-hidden /> {feature}
                    </li>
                  ))}
                </ul>
                {!isCurrent ? (
                  <Button disabled variant="outline" className="mt-auto">
                    Bientôt disponible
                  </Button>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
