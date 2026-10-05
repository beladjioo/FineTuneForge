import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground shadow-sm">
        <Flame className="size-4" aria-hidden />
      </span>
      {withText && (
        <span>
          FineTune<span className="text-brand">Forge</span>
        </span>
      )}
    </span>
  );
}
