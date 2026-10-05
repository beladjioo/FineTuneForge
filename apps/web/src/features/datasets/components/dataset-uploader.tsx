"use client";

import { ClipboardPaste, FileUp, LoaderCircle, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatBytes } from "@/lib/utils";
import {
  createDatasetUploadAction,
  deleteDatasetAction,
  finalizeDatasetUploadAction,
} from "../actions";
import { analyzeDataset, type DatasetAnalysis } from "../lib/analyze";
import {
  ACCEPTED_EXTENSIONS,
  detectPastedKind,
  pastedFileName,
  sourceKindFromFileName,
} from "../lib/source";
import type { DatasetSource } from "../lib/types";
import { UploadError, uploadFile } from "../lib/upload-file";
import { SampleList } from "./sample-list";
import { ValidationReport } from "./validation-report";

type Phase = "idle" | "uploading" | "processing";

interface DatasetUploaderProps {
  maxBytes: number;
  planName: string;
}

const PASTE_DEBOUNCE_MS = 400;

function defaultName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .slice(0, 100);
}

export function DatasetUploader({ maxBytes, planName }: DatasetUploaderProps) {
  const router = useRouter();
  const [source, setSource] = useState<DatasetSource>("file");

  const [file, setFile] = useState<File | null>(null);
  const [fileAnalysis, setFileAnalysis] = useState<DatasetAnalysis | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [pasteText, setPasteText] = useState("");
  const [pasteAnalysis, setPasteAnalysis] = useState<DatasetAnalysis | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pasteBytes = useMemo(() => new Blob([pasteText]).size, [pasteText]);
  const pasteTooLarge = pasteBytes > maxBytes;

  // Re-analyze pasted text shortly after the user stops typing.
  useEffect(() => {
    if (!pasteText.trim() || pasteTooLarge) {
      setPasteAnalysis(null);
      return;
    }
    const timer = setTimeout(() => {
      const kind = detectPastedKind(pasteText);
      setPasteAnalysis(analyzeDataset({ content: pasteText, fileName: pastedFileName(kind) }));
    }, PASTE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pasteText, pasteTooLarge]);

  const analysis = source === "file" ? fileAnalysis : pasteAnalysis;
  const busy = phase !== "idle";

  const selectFile = async (selected: File) => {
    setError(null);
    setFileAnalysis(null);
    if (!sourceKindFromFileName(selected.name)) {
      setFile(null);
      setError(
        `Type de fichier non supporté. Formats acceptés : ${ACCEPTED_EXTENSIONS.join(", ")}.`,
      );
      return;
    }
    if (selected.size > maxBytes) {
      setFile(null);
      setError(
        `Fichier trop volumineux (${formatBytes(selected.size)}). Maximum ${formatBytes(maxBytes)} avec le plan ${planName}.`,
      );
      return;
    }

    setFile(selected);
    if (!name) setName(defaultName(selected.name));
    setIsReadingFile(true);
    try {
      const content = await selected.text();
      setFileAnalysis(analyzeDataset({ content, fileName: selected.name }));
    } catch {
      setError("Impossible de lire ce fichier.");
    } finally {
      setIsReadingFile(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) void selectFile(dropped);
  };

  const clearFile = () => {
    setFile(null);
    setFileAnalysis(null);
    setError(null);
  };

  const startImport = async () => {
    if (!analysis?.canImport) return;
    const payload =
      source === "file"
        ? file && { body: file as Blob, fileName: file.name }
        : {
            body: new Blob([pasteText], { type: "text/plain" }),
            fileName: pastedFileName(detectPastedKind(pasteText)),
          };
    if (!payload) return;

    setError(null);
    setProgress(0);
    setPhase("uploading");

    const created = await createDatasetUploadAction({
      name,
      description: description || undefined,
      fileName: payload.fileName,
      fileSize: payload.body.size,
      source,
    });
    if (!created.ok) {
      setError(created.error);
      setPhase("idle");
      return;
    }

    const { datasetId, upload } = created.data;
    try {
      await uploadFile(upload, payload.body, setProgress);
    } catch (uploadError) {
      // Best-effort cleanup of the dataset row created for this upload.
      await deleteDatasetAction({ datasetId });
      setError(
        uploadError instanceof UploadError && uploadError.status === 413
          ? "Le fichier dépasse la taille autorisée."
          : "L'envoi du fichier a échoué. Vérifiez votre connexion et réessayez.",
      );
      setPhase("idle");
      return;
    }

    setPhase("processing");
    const finalized = await finalizeDatasetUploadAction({ datasetId });
    if (!finalized.ok) {
      setError(finalized.error);
      setPhase("idle");
      return;
    }

    if (finalized.data.status === "ready") toast.success("Dataset importé et validé.");
    else toast.error("Le dataset n'a pas passé la validation serveur.");
    router.push(`/datasets/${datasetId}`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Vos données</CardTitle>
          <CardDescription>
            Importez un fichier ou collez directement vos exemples. L'analyse se fait instantanément
            dans votre navigateur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={source} onValueChange={(value) => setSource(value as DatasetSource)}>
            <TabsList>
              <TabsTrigger value="file" disabled={busy}>
                <FileUp /> Fichier
              </TabsTrigger>
              <TabsTrigger value="paste" disabled={busy}>
                <ClipboardPaste /> Coller du texte
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="pt-2">
              {file ? (
                <div className="flex items-center gap-3 rounded-lg border px-4 py-3">
                  <FileUp className="size-5 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{file.name}</p>
                    <p className="text-muted-foreground text-xs">{formatBytes(file.size)}</p>
                  </div>
                  {isReadingFile ? <LoaderCircle className="size-4 animate-spin" /> : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearFile}
                    disabled={busy}
                    aria-label="Retirer le fichier"
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="dataset-file"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:ring-[3px] focus-within:ring-ring/50 hover:bg-muted/40",
                    isDragging && "border-brand bg-brand/5",
                  )}
                >
                  <Upload className="size-6 text-muted-foreground" aria-hidden />
                  <span className="font-medium text-sm">
                    Glissez votre fichier ici ou cliquez pour parcourir
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {ACCEPTED_EXTENSIONS.join(", ")} — {formatBytes(maxBytes)} max (plan {planName})
                  </span>
                  <input
                    id="dataset-file"
                    type="file"
                    accept={ACCEPTED_EXTENSIONS.join(",")}
                    className="sr-only"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) void selectFile(selected);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
            </TabsContent>

            <TabsContent value="paste" className="space-y-2 pt-2">
              <Label htmlFor="dataset-paste" className="sr-only">
                Texte du dataset
              </Label>
              <Textarea
                id="dataset-paste"
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                disabled={busy}
                placeholder={
                  "Collez du texte (un exemple par paragraphe) ou du JSONL :\n" +
                  '{"prompt": "…", "completion": "…"}'
                }
                className="min-h-48 font-mono text-xs"
              />
              <p
                className={cn(
                  "text-right text-muted-foreground text-xs",
                  pasteTooLarge && "text-destructive",
                )}
              >
                {formatBytes(pasteBytes)} / {formatBytes(maxBytes)}
              </p>
            </TabsContent>
          </Tabs>

          {error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {analysis ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Vérification</CardTitle>
            <CardDescription>
              {analysis.canImport
                ? "Votre dataset est prêt à être importé."
                : "Corrigez les points bloquants ci-dessous avant d'importer."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <ValidationReport
              report={analysis.report}
              stats={analysis.stats}
              format={analysis.format}
            />
            {analysis.samples.length > 0 ? (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Aperçu</h3>
                <SampleList samples={analysis.samples} limit={3} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {analysis?.canImport ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Import</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void startImport();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="dataset-name">Nom du dataset</Label>
                <Input
                  id="dataset-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  required
                  disabled={busy}
                  placeholder="Ex. : FAQ support client"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dataset-description">
                  Description <span className="font-normal text-muted-foreground">(optionnel)</span>
                </Label>
                <Textarea
                  id="dataset-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  disabled={busy}
                  className="min-h-20"
                />
              </div>

              {phase !== "idle" ? (
                <div className="space-y-2" aria-live="polite">
                  <Progress value={phase === "processing" ? 100 : Math.round(progress * 100)} />
                  <p className="text-muted-foreground text-xs">
                    {phase === "uploading"
                      ? `Envoi du fichier… ${Math.round(progress * 100)} %`
                      : "Validation et normalisation côté serveur…"}
                  </p>
                </div>
              ) : null}

              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}
                Importer{" "}
                {analysis.stats
                  ? `${analysis.stats.sampleCount.toLocaleString("fr-FR")} exemples`
                  : ""}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
