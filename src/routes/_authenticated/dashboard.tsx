import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Globe2, MessageCircle, Trophy, Star, Search as SearchIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · LeadFinder" },
      { name: "description", content: "Indicadores da sua prospecção." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { data } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const [total, noSite, contacted, clients, favorites, searches] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }).or("website.is.null,website.eq."),
        supabase.from("companies").select("id", { count: "exact", head: true }).neq("status", "novo"),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "cliente"),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("favorite", true),
        supabase.from("searches").select("id", { count: "exact", head: true }),
      ]);
      return {
        total: total.count ?? 0,
        noSite: noSite.count ?? 0,
        contacted: contacted.count ?? 0,
        clients: clients.count ?? 0,
        favorites: favorites.count ?? 0,
        searches: searches.count ?? 0,
      };
    },
  });

  const kpis = [
    { label: "Empresas encontradas", value: data?.total ?? 0, icon: Building2 },
    { label: "Sem website", value: data?.noSite ?? 0, icon: Globe2 },
    { label: "Contatadas", value: data?.contacted ?? 0, icon: MessageCircle },
    { label: "Clientes", value: data?.clients ?? 0, icon: Trophy },
    { label: "Favoritos", value: data?.favorites ?? 0, icon: Star },
    { label: "Pesquisas", value: data?.searches ?? 0, icon: SearchIcon },
  ];

  return (
    <AppShell title="Dashboard" description="Visão geral da sua prospecção">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/60 bg-card/60">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{k.label}</CardTitle>
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <k.icon className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}