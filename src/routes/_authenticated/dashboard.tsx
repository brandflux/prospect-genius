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
  Clock,
  Lock,
  Sparkles,
  Cpu
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { SearchProviderService } from "@/lib/providers/service";

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

  // Fetch subscription and trial status
  const { data: subData } = useQuery({
    queryKey: ["user-subscription-status"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { isPro: false, trial: null, isTrialFinished: true, userId: null };

      const [subRes, trialRes] = await Promise.all([
        supabase.from("subscriptions").select("*").eq("user_id", userData.user.id).maybeSingle(),
        supabase.from("trial_usage").select("*").eq("user_id", userData.user.id).maybeSingle()
      ]);

      const isPro = subRes.data?.status === "active";
      const isTrialFinished = trialRes.data?.trial_finished || (trialRes.data?.searches_used && trialRes.data.searches_used >= 1);

      return {
        isPro,
        trial: trialRes.data,
        isTrialFinished,
        userId: userData.user.id,
      };
    }
  });

  // Query active provider
  const { data: activeProvider } = useQuery({
    queryKey: ["active-search-provider"],
    queryFn: () => SearchProviderService.getActiveProvider(),
  });

  // Query searches count for the active provider
  const { data: activeProviderSearchesCount = 0 } = useQuery({
    queryKey: ["active-provider-searches-count", activeProvider?.provider],
    queryFn: async () => {
      if (!activeProvider?.provider) return 0;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return 0;
      
      const { count, error } = await supabase
        .from("searches")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userData.user.id)
        .eq("provider", activeProvider.provider);
        
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!activeProvider?.provider,
  });

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
        {/* Top Cards grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Trial / Subscription Status Card */}
          {subData && (
            <Card className={`overflow-hidden border relative bg-card/60 md:col-span-2 ${
              subData.isPro 
                ? "border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent" 
                : subData.isTrialFinished 
                  ? "border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-transparent to-transparent" 
                  : "border-slate-800"
            }`}>
              <CardContent className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 h-full">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    {subData.isPro ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-semibold px-2.5 py-0.5 uppercase">
                        ✨ LeadFinder Pro Active
                      </Badge>
                    ) : subData.isTrialFinished ? (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/5 text-xs font-semibold px-2.5 py-0.5 uppercase">
                        🔒 Trial Expired
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-yellow-500/30 text-yellow-400 bg-yellow-500/5 text-xs font-semibold px-2.5 py-0.5 uppercase">
                        🟡 Free Trial
                      </Badge>
                    )}
                  </div>
                  
                  {subData.isPro ? (
                    <div>
                      <h3 className="text-sm font-bold text-slate-100">Unlimited Searches & CRM Active</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Sua conta possui acesso ilimitado a todas as buscas, filtros avançados por CEP, coordenadas e CRM.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">
                          {subData.isTrialFinished ? "Seu período de teste grátis expirou" : "1 Search Included"}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {subData.isTrialFinished 
                            ? "Faça o upgrade para o LeadFinder Pro para desbloquear buscas ilimitadas." 
                            : "Cada pesquisa no trial libera a visualização dos 20 primeiros leads."}
                        </p>
                      </div>

                      {/* Progress Bar & Counters */}
                      <div className="space-y-1.5 max-w-md">
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                          <span>Searches Used: {subData.trial?.searches_used ?? 0} / 1</span>
                          <span>Results Available: 20 / Total</span>
                        </div>
                        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-border/20">
                          <div 
                            className={`h-full transition-all duration-500 ${subData.isTrialFinished ? "bg-amber-500" : "bg-yellow-500"}`} 
                            style={{ width: subData.isTrialFinished ? "100%" : "0%" }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {!subData.isPro && (
                  <Button 
                    onClick={() => navigate({ to: "/pricing" })}
                    className="bg-primary hover:bg-primary/95 text-white font-semibold text-xs h-10 px-5 shadow-lg shadow-primary/20 shrink-0 w-full md:w-auto"
                  >
                    Upgrade to Pro
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Current Search Provider Card */}
          <Card className="border-border/60 bg-card/60 overflow-hidden relative flex flex-col justify-between">
            <div className="absolute -right-8 -top-8 size-20 bg-primary/10 rounded-full blur-xl" />
            <CardHeader className="pb-2">
              <span className="text-[10px] text-muted-foreground font-mono block">PROVIDER ATIVO</span>
              <div className="flex items-center gap-2 mt-1">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Cpu className="size-4.5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-100">
                    {activeProvider?.display_name || "OpenStreetMap"}
                  </CardTitle>
                  <Badge variant="outline" className="text-[9px] mt-0.5 border-primary/20 bg-primary/5 text-primary px-1.5 py-px">
                    Active
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-2 space-y-4 flex-1 flex flex-col justify-between">
              <div className="flex justify-between items-center text-xs pt-2">
                <span className="text-muted-foreground">Pesquisas realizadas:</span>
                <span className="font-semibold text-slate-100 tabular-nums">{activeProviderSearchesCount}</span>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full text-xs font-semibold h-8 mt-2"
                onClick={() => navigate({ to: "/settings", search: { tab: "providers" } })}
              >
                Manage Providers
              </Button>
            </CardContent>
          </Card>
        </div>

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