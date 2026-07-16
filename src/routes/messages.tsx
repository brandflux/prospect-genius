import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Mail, Instagram } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Mensagens IA · LeadFinder AI" },
      { name: "description", content: "Gere mensagens de prospecção com IA." },
    ],
  }),
  component: MessagesPage,
});

const channels = [
  { icon: MessageSquare, label: "WhatsApp", body: "Mensagem curta com CTA direto." },
  { icon: Mail, label: "E-mail", body: "Cold email personalizado por nicho." },
  { icon: Instagram, label: "Instagram DM", body: "Abordagem informal e visual." },
];

function MessagesPage() {
  return (
    <AppShell
      title="Mensagens IA"
      description="Templates de prospecção (geração real na Etapa 4)"
    >
      <div className="grid gap-4 md:grid-cols-3">
        {channels.map((c) => (
          <Card key={c.label} className="border-border/60 bg-card/60">
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <c.icon className="size-4" />
              </div>
              <CardTitle className="text-base">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{c.body}</CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}