import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin, Sparkles, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 opacity-60 blur-[140px]" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Sparkles className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">LeadFinder</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              AI Prospecting
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/dashboard">
              Abrir app <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="size-1.5 rounded-full bg-primary" />
            Google Places + IA · Prospecção B2B
          </div>
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            Encontre empresas locais{" "}
            <span className="bg-gradient-to-r from-primary to-fuchsia-400 bg-clip-text text-transparent">
              sem site
            </span>{" "}
            e feche mais clientes.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground">
            Busque empresas por região, detecte automaticamente quem não tem
            presença digital, ranqueie por Score de Lead e envie mensagens
            personalizadas geradas por IA.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/dashboard">
                Começar agora <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/search">Ver busca</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-20 grid max-w-5xl gap-4 sm:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "Busca geolocalizada",
              body: "Palavra-chave, cidade, estado e raio via Google Places.",
            },
            {
              icon: Target,
              title: "Lead Score automático",
              body: "Sem site, rating, reviews, telefone e WhatsApp em um score 0–100.",
            },
            {
              icon: Zap,
              title: "Mensagens IA",
              body: "WhatsApp, e-mail e DM prontos para copiar e enviar.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur transition-colors hover:border-primary/40"
            >
              <div className="mb-3 grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                <f.icon className="size-4" />
              </div>
              <div className="text-sm font-semibold">{f.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
