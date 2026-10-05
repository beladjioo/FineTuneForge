import { ArrowRight, BarChart3, Cpu, Database, Rocket, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/config/plans";
import { getSession } from "@/server/auth/session";

const STEPS = [
  {
    icon: Database,
    title: "Importez vos données",
    text: "Textes, conversations, FAQ : .txt, .jsonl ou .csv, validés automatiquement.",
  },
  {
    icon: SlidersHorizontal,
    title: "Choisissez un modèle",
    text: "Llama 3.2, Qwen 2.5, Gemma 2, Phi-3.5… de 1B à 7B paramètres.",
  },
  {
    icon: Cpu,
    title: "Fine-tunez en LoRA",
    text: "Presets Débutant / Intermédiaire / Avancé, suivi de la loss en direct.",
  },
  {
    icon: BarChart3,
    title: "Évaluez",
    text: "Perplexité et comparaison avant/après sur vos propres exemples.",
  },
  {
    icon: Rocket,
    title: "Déployez en un clic",
    text: "Space Hugging Face privée ou publique + endpoint d'API documenté.",
  },
];

export default async function HomePage() {
  const session = await getSession();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-8">
        <Logo />
        <nav className="flex items-center gap-2">
          {session ? (
            <Button asChild>
              <Link href="/dashboard">Tableau de bord</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/sign-in">Connexion</Link>
              </Button>
              <Button asChild>
                <Link href="/sign-up">Commencer</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 pt-16 pb-20 text-center md:pt-24">
          <p className="mb-4 inline-block rounded-full border px-3 py-1 text-muted-foreground text-xs">
            Fine-tuning LoRA · modèles open-source · déploiement Hugging Face
          </p>
          <h1 className="font-semibold text-4xl tracking-tight md:text-5xl">
            Votre propre LLM, entraîné sur <span className="text-brand">vos données</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            FineTuneForge rend le fine-tuning accessible sans expertise ML : importez vos exemples,
            choisissez un modèle, on s'occupe du reste.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link href={session ? "/dashboard" : "/sign-up"}>
                {session ? "Ouvrir le tableau de bord" : "Créer un compte gratuit"} <ArrowRight />
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-muted-foreground text-xs">
            Plan {PLANS.free.name} : {PLANS.free.limits.fineTunesPerMonth} fine-tune par mois, sans
            carte bancaire.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 md:px-8">
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="rounded-xl border bg-card p-5">
                <div className="mb-3 flex items-center gap-2 text-muted-foreground text-xs">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted font-medium text-foreground">
                    {index + 1}
                  </span>
                  <Icon className="size-4" aria-hidden />
                </div>
                <h2 className="font-medium">{title}</h2>
                <p className="mt-1 text-muted-foreground text-sm">{text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t py-6 text-center text-muted-foreground text-xs">
        © {new Date().getFullYear()} FineTuneForge
      </footer>
    </div>
  );
}
