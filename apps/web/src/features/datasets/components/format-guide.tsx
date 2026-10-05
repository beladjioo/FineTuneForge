import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DATASET_LIMITS } from "../lib/constants";

const EXAMPLES = [
  {
    title: "Conversations (.jsonl)",
    description: "Pour un chatbot ou un assistant.",
    code: `{"messages": [
  {"role": "user", "content": "Vos horaires ?"},
  {"role": "assistant", "content": "9h–18h, du lundi au vendredi."}
]}`,
  },
  {
    title: "Instruction → Réponse (.jsonl, .csv)",
    description: "Colonnes prompt/completion, question/answer ou instruction/output.",
    code: `question;answer
Comment réinitialiser mon mot de passe ?;Cliquez sur « Mot de passe oublié »…`,
  },
  {
    title: "Texte brut (.txt)",
    description: "Pour apprendre un style d'écriture. Un paragraphe = un exemple.",
    code: `Premier article de blog…

Deuxième article de blog…`,
  },
];

export function FormatGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Formats acceptés</CardTitle>
        <CardDescription>
          Au moins {DATASET_LIMITS.minSamples} exemples ({DATASET_LIMITS.recommendedMinSamples}+
          recommandés). Encodage UTF-8.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {EXAMPLES.map((example) => (
          <div key={example.title} className="space-y-1.5">
            <p className="font-medium text-sm">{example.title}</p>
            <p className="text-muted-foreground text-xs">{example.description}</p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
              {example.code}
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
