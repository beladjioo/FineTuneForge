"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h2 className="font-semibold text-xl">Une erreur est survenue</h2>
      <p className="max-w-md text-muted-foreground text-sm">
        Le problème a été enregistré{error.digest ? ` (réf. ${error.digest})` : ""}. Vous pouvez
        réessayer.
      </p>
      <Button onClick={reset} variant="outline">
        <RotateCcw /> Réessayer
      </Button>
    </div>
  );
}
