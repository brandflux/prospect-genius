import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";


export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Configurações · LeadFinder AI" },
      { name: "description", content: "Conexões e chaves de API." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell title="Configurações" description="Integrações e conexões">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/60">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Supabase</CardTitle>
            <Badge className="border-transparent bg-emerald-500/15 text-emerald-300">
              Conectado
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              Backend gerenciado pelo Lovable Cloud. Nenhuma configuração manual necessária —
              autenticação, banco, storage e functions já estão prontos para uso.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Google Places API</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>API Key (guardada em Edge Function na Etapa 2)</Label>
            <Input placeholder="Será configurada como secret no Supabase" disabled />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="text-base">Provider de IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>OpenAI / outro (Etapa 4)</Label>
            <Input placeholder="Será configurado como secret" disabled />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}