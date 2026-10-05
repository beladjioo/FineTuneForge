"use client";

import { Cpu, ExternalLink, Info, LoaderCircle, Lock, Rocket, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type BaseModel, GPUS, MODEL_BADGE_LABELS } from "@/config/models";
import { FORMAT_LABELS } from "@/features/datasets/lib/labels";
import type { DatasetFormat } from "@/features/datasets/lib/types";
import { cn, formatCompact, formatNumber } from "@/lib/utils";
import { createFineTuneJobAction } from "../actions";
import { estimateTraining, formatDuration } from "../lib/estimate";
import { hyperparametersSchema, LORA_RANKS, type NamedPreset, PRESETS } from "../lib/presets";
import { REPO_NAME_PATTERN, toRepoName } from "../lib/repo-name";
import type { LoraHyperparameters, OutputDestination, TrainingPreset } from "../types";

export interface WizardDataset {
  id: string;
  name: string;
  format: DatasetFormat | null;
  sampleCount: number;
  avgChars: number;
}

export interface FineTuneWizardProps {
  datasets: WizardDataset[];
  models: BaseModel[];
  defaultDatasetId?: string;
  hfUsername: string | null;
  platformNamespace: string | null;
  simulated: boolean;
  privateAllowed: boolean;
  remainingThisMonth: number | null;
  blockedReason: string | null;
}

const DEFAULT_MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct";
const LEARNING_RATES = [5e-5, 1e-4, 2e-4, 3e-4, 5e-4];
const SEQ_LENGTHS = [512, 1024, 2048, 4096];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

function Section({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {step}. {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** A radio input rendered as a selectable card (keyboard and screen-reader friendly). */
function ChoiceCard({
  name,
  value,
  checked,
  onChange,
  disabled,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer flex-col gap-1.5 rounded-lg border p-4 transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-muted/40",
        checked && "border-primary ring-1 ring-primary",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      {children}
    </label>
  );
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

export function FineTuneWizard(props: FineTuneWizardProps) {
  const { datasets, models, hfUsername, platformNamespace, simulated, privateAllowed } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [datasetId, setDatasetId] = useState(
    props.defaultDatasetId && datasets.some((dataset) => dataset.id === props.defaultDatasetId)
      ? props.defaultDatasetId
      : (datasets[0]?.id ?? ""),
  );
  const [modelId, setModelId] = useState(
    models.some((model) => model.id === DEFAULT_MODEL_ID)
      ? DEFAULT_MODEL_ID
      : (models[0]?.id ?? ""),
  );
  const [preset, setPreset] = useState<NamedPreset>("beginner");
  const [customize, setCustomize] = useState(false);
  const [custom, setCustom] = useState<LoraHyperparameters>(PRESETS.beginner.hyperparameters);

  const dataset = datasets.find((item) => item.id === datasetId);
  const model = models.find((item) => item.id === modelId);

  const defaultName =
    dataset && model ? `${dataset.name} · ${model.name.split(" ").slice(0, 3).join(" ")}` : "";
  const [name, setName] = useState<string | null>(null);
  const [repoName, setRepoName] = useState<string | null>(null);
  const effectiveName = (name ?? defaultName).slice(0, 80);
  const effectiveRepoName = repoName ?? toRepoName(effectiveName);
  const [isPrivate, setIsPrivate] = useState(false);
  const [destination, setDestination] = useState<OutputDestination>(
    hfUsername || simulated || !platformNamespace ? "user" : "platform",
  );

  const hyperparameters = customize ? custom : PRESETS[preset].hyperparameters;
  const effectivePreset: TrainingPreset = customize ? "custom" : preset;
  const customParse = customize ? hyperparametersSchema.safeParse(custom) : null;
  const customErrors = customParse?.error;

  const estimate = useMemo(
    () =>
      model && dataset
        ? estimateTraining({
            model,
            hyperparameters,
            sampleCount: dataset.sampleCount,
            avgChars: dataset.avgChars,
          })
        : null,
    [model, dataset, hyperparameters],
  );

  const namespace =
    destination === "platform"
      ? platformNamespace
      : (hfUsername ?? (simulated ? "simulation" : null));
  const missingHub = !namespace;
  const repoNameValid = REPO_NAME_PATTERN.test(effectiveRepoName);

  const blocked =
    props.blockedReason ??
    (missingHub ? "Connectez votre compte Hugging Face pour y publier votre modèle." : null);
  const canSubmit =
    !blocked &&
    !isPending &&
    Boolean(dataset && model && effectiveName.trim()) &&
    repoNameValid &&
    !customErrors;

  const toggleCustomize = () => {
    if (!customize) setCustom({ ...PRESETS[preset].hyperparameters });
    setCustomize(!customize);
  };
  const setCustomValue = <K extends keyof LoraHyperparameters>(
    key: K,
    value: LoraHyperparameters[K],
  ) => setCustom((current) => ({ ...current, [key]: value }));

  const submit = () =>
    startTransition(async () => {
      if (!dataset || !model) return;
      setError(null);
      const result = await createFineTuneJobAction({
        datasetId: dataset.id,
        baseModelId: model.id,
        preset: effectivePreset,
        hyperparameters: customParse?.success ? customParse.data : undefined,
        name: effectiveName.trim(),
        repoName: effectiveRepoName,
        private: isPrivate,
        destination,
      });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Fine-tuning lancé !");
      router.push(`/fine-tunes/${result.data.jobId}`);
    });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Section
          step={1}
          title="Dataset"
          description="Les exemples dont votre modèle va s'inspirer."
        >
          <div className="space-y-2">
            <Label htmlFor="dataset" className="sr-only">
              Dataset
            </Label>
            <select
              id="dataset"
              className={selectClass}
              value={datasetId}
              onChange={(event) => setDatasetId(event.target.value)}
            >
              {datasets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {formatNumber(item.sampleCount)} exemples
                  {item.format ? ` (${FORMAT_LABELS[item.format]})` : ""}
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section
          step={2}
          title="Modèle de base"
          description="Plus un modèle est gros, plus il est capable… et plus l'entraînement est long."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {models.map((item) => (
              <ChoiceCard
                key={item.id}
                name="model"
                value={item.id}
                checked={item.id === modelId}
                onChange={() => setModelId(item.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-sm">{item.name}</span>
                  <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                    {item.paramsB.toLocaleString("fr-FR")} Md
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">{item.description}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {item.badges.map((badge) => (
                    <Badge key={badge} variant={badge === "recommended" ? "default" : "secondary"}>
                      {MODEL_BADGE_LABELS[badge]}
                    </Badge>
                  ))}
                  {item.gated ? (
                    <Badge variant="outline">
                      <Lock /> Licence à accepter
                    </Badge>
                  ) : null}
                  {!item.license.commercialUse ? (
                    <Badge variant="warning">
                      <TriangleAlert /> Non commercial
                    </Badge>
                  ) : null}
                </div>
                <p className="pt-1 text-muted-foreground text-[11px]">
                  {item.publisher} · {item.license.label} · GPU {item.gpu}
                </p>
              </ChoiceCard>
            ))}
          </div>

          {model?.gated && !simulated ? (
            <Alert variant="warning" className="mt-4">
              <Lock />
              <AlertDescription>
                <p>
                  {model.name} est soumis à licence : acceptez-la avec votre compte Hugging Face
                  {hfUsername ? ` (@${hfUsername})` : ""} avant de lancer.{" "}
                  <a
                    href={`https://huggingface.co/${model.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline"
                  >
                    Ouvrir la page du modèle <ExternalLink className="size-3" />
                  </a>
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
          {model && !model.supportsSystemPrompt && dataset?.format === "chat" ? (
            <Alert variant="info" className="mt-4">
              <Info />
              <AlertDescription>
                Ce modèle ne gère pas de message « system » : il sera fusionné au premier message
                utilisateur de chaque conversation.
              </AlertDescription>
            </Alert>
          ) : null}
        </Section>

        <Section
          step={3}
          title="Réglages d'entraînement"
          description="Les presets conviennent à la grande majorité des cas : commencez par « Débutant »."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.entries(PRESETS) as [NamedPreset, (typeof PRESETS)[NamedPreset]][]).map(
              ([id, definition]) => (
                <ChoiceCard
                  key={id}
                  name="preset"
                  value={id}
                  checked={!customize && preset === id}
                  onChange={() => {
                    setPreset(id);
                    setCustomize(false);
                  }}
                >
                  <span className="font-medium text-sm">{definition.label}</span>
                  <span className="text-muted-foreground text-xs">{definition.summary}</span>
                  <span className="pt-1 text-[11px] text-muted-foreground tabular-nums">
                    rank {definition.hyperparameters.loraRank} · {definition.hyperparameters.epochs}{" "}
                    epochs
                  </span>
                </ChoiceCard>
              ),
            )}
          </div>

          <Button
            type="button"
            variant="link"
            className="mt-3 h-auto px-0"
            onClick={toggleCustomize}
            aria-expanded={customize}
          >
            {customize ? "Revenir aux presets" : "Personnaliser les réglages"}
          </Button>

          {customize ? (
            <div className="mt-3 space-y-4 rounded-lg border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rank">LoRA rank</Label>
                  <select
                    id="rank"
                    className={selectClass}
                    value={custom.loraRank}
                    onChange={(event) => setCustomValue("loraRank", Number(event.target.value))}
                  >
                    {LORA_RANKS.map((rank) => (
                      <option key={rank} value={rank}>
                        {rank}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    Capacité d'apprentissage de l'adapter.
                  </p>
                </div>
                <NumberField
                  id="alpha"
                  label="LoRA alpha"
                  hint="Intensité de l'adaptation (souvent 2 × rank)."
                  value={custom.loraAlpha}
                  onChange={(value) => setCustomValue("loraAlpha", value)}
                  min={1}
                  max={256}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="lr">Learning rate</Label>
                  <select
                    id="lr"
                    className={selectClass}
                    value={custom.learningRate}
                    onChange={(event) => setCustomValue("learningRate", Number(event.target.value))}
                  >
                    {LEARNING_RATES.map((rate) => (
                      <option key={rate} value={rate}>
                        {rate.toExponential(0)}
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    Trop haut : instable. Trop bas : apprend peu.
                  </p>
                </div>
                <NumberField
                  id="epochs"
                  label="Epochs"
                  hint="Nombre de passages sur le dataset."
                  value={custom.epochs}
                  onChange={(value) => setCustomValue("epochs", value)}
                  min={1}
                  max={10}
                />
              </div>
              <details>
                <summary className="cursor-pointer select-none text-muted-foreground text-sm">
                  Avancé
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <NumberField
                    id="batch"
                    label="Batch size"
                    hint="Exemples traités en parallèle par le GPU."
                    value={custom.batchSize}
                    onChange={(value) => setCustomValue("batchSize", value)}
                    min={1}
                    max={32}
                  />
                  <NumberField
                    id="grad-acc"
                    label="Accumulation de gradient"
                    hint="Batch effectif = batch size × accumulation."
                    value={custom.gradientAccumulationSteps}
                    onChange={(value) => setCustomValue("gradientAccumulationSteps", value)}
                    min={1}
                    max={32}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="seq">Longueur max (tokens)</Label>
                    <select
                      id="seq"
                      className={selectClass}
                      value={custom.maxSeqLength}
                      onChange={(event) =>
                        setCustomValue("maxSeqLength", Number(event.target.value))
                      }
                    >
                      {SEQ_LENGTHS.map((length) => (
                        <option key={length} value={length}>
                          {length}
                        </option>
                      ))}
                    </select>
                    <p className="text-muted-foreground text-xs">
                      Les exemples plus longs sont tronqués.
                    </p>
                  </div>
                  <NumberField
                    id="dropout"
                    label="Dropout LoRA"
                    hint="Régularisation contre le sur-apprentissage."
                    value={custom.loraDropout}
                    onChange={(value) => setCustomValue("loraDropout", value)}
                    min={0}
                    max={0.5}
                    step={0.05}
                  />
                </div>
              </details>
              {customErrors ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {customErrors.issues[0]?.message ?? "Valeurs invalides."}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section
          step={4}
          title="Publication"
          description="Le modèle entraîné (un adapter LoRA) est publié sur Hugging Face."
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="job-name">Nom du modèle</Label>
              <Input
                id="job-name"
                value={effectiveName}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. : Assistant support client"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="repo-name">Dépôt Hugging Face</Label>
              <div className="flex items-center rounded-md border border-input shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="max-w-[45%] truncate border-r bg-muted px-3 py-2 text-muted-foreground text-sm">
                  {namespace ?? "votre-compte"}/
                </span>
                <input
                  id="repo-name"
                  className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                  value={effectiveRepoName}
                  onChange={(event) => setRepoName(event.target.value.toLowerCase())}
                  aria-invalid={!repoNameValid}
                  spellCheck={false}
                />
              </div>
              {!repoNameValid ? (
                <p className="text-destructive text-xs">
                  Minuscules, chiffres, « - », « _ » ou « . » uniquement.
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Un suffixe est ajouté automatiquement si le nom est déjà pris.
                </p>
              )}
            </div>

            {hfUsername && platformNamespace ? (
              <fieldset className="space-y-2">
                <legend className="font-medium text-sm">Compte de publication</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    name="destination"
                    value="user"
                    checked={destination === "user"}
                    onChange={() => setDestination("user")}
                  >
                    <span className="font-medium text-sm">Votre compte (@{hfUsername})</span>
                    <span className="text-muted-foreground text-xs">
                      Vous gardez la pleine propriété du modèle.
                    </span>
                  </ChoiceCard>
                  <ChoiceCard
                    name="destination"
                    value="platform"
                    checked={destination === "platform"}
                    onChange={() => setDestination("platform")}
                  >
                    <span className="font-medium text-sm">Compte FineTuneForge</span>
                    <span className="text-muted-foreground text-xs">
                      Hébergé par nous sur {platformNamespace}.
                    </span>
                  </ChoiceCard>
                </div>
              </fieldset>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="font-medium text-sm">Visibilité</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  name="visibility"
                  value="public"
                  checked={!isPrivate}
                  onChange={() => setIsPrivate(false)}
                >
                  <span className="font-medium text-sm">Public</span>
                  <span className="text-muted-foreground text-xs">
                    Visible par tous sur Hugging Face.
                  </span>
                </ChoiceCard>
                <ChoiceCard
                  name="visibility"
                  value="private"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(true)}
                  disabled={!privateAllowed}
                >
                  <span className="flex items-center gap-2 font-medium text-sm">
                    Privé {!privateAllowed ? <Badge variant="secondary">Pro</Badge> : null}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Visible uniquement par vous.
                  </span>
                </ChoiceCard>
              </div>
            </fieldset>

            {missingHub ? (
              <Alert variant="warning">
                <TriangleAlert />
                <AlertDescription>
                  <p>
                    Connectez votre compte Hugging Face pour y publier votre modèle.{" "}
                    <Link href="/settings" className="font-medium underline">
                      Aller aux paramètres
                    </Link>
                  </p>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </Section>
      </div>

      <Card className="lg:sticky lg:top-20">
        <CardHeader>
          <CardTitle className="text-base">Récapitulatif</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="divide-y">
            <SummaryRow label="Modèle" value={model?.name ?? "—"} />
            <SummaryRow
              label="Dataset"
              value={dataset ? `${formatNumber(dataset.sampleCount)} exemples` : "—"}
            />
            <SummaryRow
              label="Réglages"
              value={customize ? "Personnalisés" : PRESETS[preset].label}
            />
            {estimate ? (
              <>
                <SummaryRow label="Steps" value={formatNumber(estimate.totalSteps)} />
                <SummaryRow
                  label="Tokens entraînés"
                  value={formatCompact(estimate.trainedTokens)}
                />
                <SummaryRow
                  label="Matériel"
                  value={simulated ? "Simulation" : model ? GPUS[model.gpu].label : "—"}
                />
                <SummaryRow
                  label="Durée estimée"
                  value={simulated ? "~1 min" : formatDuration(estimate.estimatedSeconds)}
                />
              </>
            ) : null}
          </dl>

          <p className="text-muted-foreground text-xs">
            {props.remainingThisMonth === null
              ? "Fine-tunes illimités avec votre plan."
              : `Il vous reste ${props.remainingThisMonth} fine-tune${props.remainingThisMonth > 1 ? "s" : ""} ce mois-ci.`}
          </p>

          {blocked ? (
            <Alert variant="warning">
              <AlertDescription>{blocked}</AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={submit}>
            {isPending ? <LoaderCircle className="animate-spin" /> : <Rocket />}
            Lancer le fine-tuning
          </Button>
          {simulated ? (
            <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Cpu className="size-3.5" /> Mode simulation : aucun GPU utilisé.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
