import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { 
  Building2, 
  Globe2, 
  MessageCircle, 
  Trophy, 
  Star, 
  Search as SearchIcon,
  ChevronRight,
  Clock
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["dashboard-kpis-and-searches"],
    queryFn: async () => {
      const [total, noSite, contacted, clients, favorites, searchesCount, recentSearches] = await Promise.all([
        supabase.from("companies").select("id", { count: "exact", head: true }),
        supabase.from("companies").select("id", { count: "exact", head: true }).or("website.is.null,website.eq."),
        supabase.from("companies").select("id", { count: "exact", head: true }).neq("status", "novo"),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "cliente"),
        supabase.from("companies").select("id", { count: "exact", head: true }).eq("favorite", true),
        supabase.from("searches").select("id", { count: "exact", head: true }),
        supabase.from("searches").select("*").order("created_at", { ascending: false }).limit(5),
      ]);

      return {
        total: total.count ?? 0,
        noSite: noSite.count ?? 0,
        contacted: contacted.count ?? 0,
        clients: clients.count ?? 0,
        favorites: favorites.count ?? 0,
        searches: searchesCount.count ?? 0,
        recentSearches: recentSearches.data ?? [],
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

  const handleSearchClick = (searchId: string) => {
    navigate({
      to: "/search",
      search: { searchId },
    });
  };

  return (
    <AppShell title="Dashboard" description="Visão geral da sua prospecção">
      <div className="space-y-6">
        {/* KPIs grid */}
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
                <div className="text-3xl font-semibold tabular-nums text-slate-100">{k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Searches section */}
        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-100">
              <Clock className="size-4 text-primary" />
              Últimas Pesquisas
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            {(!data?.recentSearches || data.recentSearches.length === 0) ? (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhuma pesquisa realizada ainda.</p>
            ) : (
              <div className="divide-y divide-border/20">
                {data.recentSearches.map((s) => {
                  const formattedDate = new Date(s.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  });

                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSearchClick(s.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors hover:bg-slate-900/60 group"
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-200">{s.keyword}</span>
                          {s.cep && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/20 text-primary bg-primary/5">
                              CEP {s.cep}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 mt-1 text-[10px] text-muted-foreground">
                          {s.city && <span>{s.city}</span>}
                          {s.city && <span>·</span>}
                          <span>Raio: {s.radius_km} km</span>
                          <span>·</span>
                          <span className="text-emerald-400 font-medium">{s.result_count} empresas encontradas</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
                        <ChevronRight className="size-4 text-muted-foreground group-hover:text-slate-200 transition-colors" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}