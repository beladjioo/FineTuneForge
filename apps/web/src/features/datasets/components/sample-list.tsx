import { cn } from "@/lib/utils";
import { sampleKey } from "../lib/samples";
import type { ChatRole, TrainingSample } from "../lib/types";

const ROLE_LABELS: Record<ChatRole, string> = {
  system: "Système",
  user: "Utilisateur",
  assistant: "Assistant",
};

function SampleBody({ sample }: { sample: TrainingSample }) {
  if ("text" in sample) {
    return <p className="line-clamp-6 whitespace-pre-wrap text-sm">{sample.text}</p>;
  }

  if ("prompt" in sample) {
    return (
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Consigne
          </p>
          <p className="line-clamp-6 whitespace-pre-wrap">{sample.prompt}</p>
        </div>
        <div className="space-y-1">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Réponse attendue
          </p>
          <p className="line-clamp-6 whitespace-pre-wrap">{sample.completion}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sample.messages.map((message, index) => (
        <div
          // Messages of a stored sample never move: the index is a stable key.
          // biome-ignore lint/suspicious/noArrayIndexKey: static, never reordered
          key={index}
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-sm",
            message.role === "assistant" && "ml-auto bg-primary text-primary-foreground",
            message.role === "user" && "bg-muted",
            message.role === "system" && "max-w-full border border-dashed text-muted-foreground",
          )}
        >
          <p className="mb-0.5 font-medium text-xs opacity-70">{ROLE_LABELS[message.role]}</p>
          <p className="line-clamp-6 whitespace-pre-wrap">{message.content}</p>
        </div>
      ))}
    </div>
  );
}

export function SampleList({ samples, limit }: { samples: TrainingSample[]; limit?: number }) {
  const visible = limit ? samples.slice(0, limit) : samples;
  return (
    <ol className="space-y-3">
      {visible.map((sample, index) => (
        <li key={sampleKey(sample)} className="rounded-lg border p-4">
          <p className="mb-2 text-muted-foreground text-xs">Exemple {index + 1}</p>
          <SampleBody sample={sample} />
        </li>
      ))}
    </ol>
  );
}
