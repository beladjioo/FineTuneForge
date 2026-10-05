"use client";

import { Ban, LoaderCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { cancelFineTuneJobAction } from "../actions";

export function CancelJobButton({ jobId }: { jobId: string }) {
  const [isPending, startTransition] = useTransition();

  const onConfirm = () =>
    startTransition(async () => {
      const result = await cancelFineTuneJobAction({ jobId });
      if (result.ok) toast.success("Fine-tuning annulé.");
      else toast.error(result.error);
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" /> : <Ban />}
          Annuler
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler ce fine-tuning ?</AlertDialogTitle>
          <AlertDialogDescription>
            L'entraînement sera arrêté immédiatement et aucun modèle ne sera publié. Un fine-tuning
            annulé n'est pas décompté de votre quota mensuel.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuer l'entraînement</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            onClick={onConfirm}
          >
            Annuler le fine-tuning
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
