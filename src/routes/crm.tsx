import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/crm")({
  head: () => ({
    meta: [
      { title: "CRM · LeadFinder AI" },
      { name: "description", content: "Organize seus leads no funil de vendas." },
    ],
  }),
  component: CrmPage,
});

const columns = [
  { key: "novo", label: "Novo", tone: "bg-slate-500/15 text-slate-300" },
  { key: "contatado", label: "Contatado", tone: "bg-blue-500/15 text-blue-300" },
  { key: "respondeu", label: "Respondeu", tone: "bg-cyan-500/15 text-cyan-300" },
  { key: "negociacao", label: "Negociação", tone: "bg-amber-500/15 text-amber-300" },
  { key: "cliente", label: "Cliente", tone: "bg-emerald-500/15 text-emerald-300" },
  { key: "perdido", label: "Perdido", tone: "bg-rose-500/15 text-rose-300" },
];

function CrmPage() {
  return (
    <AppShell title="CRM" description="Funil de leads (drag & drop na Etapa 3)">
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {columns.map((c) => (
          <Card key={c.key} className="border-border/60 bg-card/60 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">{c.label}</div>
              <Badge className={c.tone + " border-transparent"}>0</Badge>
            </div>
            <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-xs text-muted-foreground">
              Sem leads
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}