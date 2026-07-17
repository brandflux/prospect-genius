import { createFileRoute } from "@tanstack/react-router";
import {
  Search as SearchIcon,
  Building2,
  Globe2,
  Flame,
  Trophy,
  Send,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · LeadFinder AI" },
      { name: "description", content: "Visão geral das suas pesquisas, leads e conversões." },
    ],
  }),
  component: DashboardPage,
});

const kpis = [
  { label: "Pesquisas", value: 0, icon: SearchIcon, hint: "Buscas realizadas" },
  { label: "Empresas encontradas", value: 0, icon: Building2, hint: "Total no banco" },
  { label: "Sem site", value: 0, icon: Globe2, hint: "Prospects prioritários" },
  { label: "Score > 80", value: 0, icon: Flame, hint: "Leads quentes" },
  { label: "Clientes", value: 0, icon: Trophy, hint: "Convertidos" },
  { label: "Mensagens enviadas", value: 0, icon: Send, hint: "Outbound total" },
];

function DashboardPage() {
  return (
    <AppShell title="Dashboard" description="Visão geral da sua prospecção">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/60 bg-card/60">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {k.label}
              </CardTitle>
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <k.icon className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">{k.value}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="size-3" /> {k.hint}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6 border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Próximos passos
            <Badge variant="secondary" className="bg-primary/15 text-primary">
              Etapa 1
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Backend do Lovable Cloud já conectado — auth, banco e functions prontos.</p>
          <p>2. Próximo: criar as tabelas (searches, companies, messages, etc.) via migration.</p>
          <p>3. Depois: integração com Google Places e geração de mensagens com IA.</p>
        </CardContent>
      </Card>
    </AppShell>
  );
}