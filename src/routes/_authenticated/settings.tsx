import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { 
  Check, 
  ShieldCheck, 
  Lock, 
  Key, 
  Cpu, 
  User, 
  CreditCard, 
  Sparkles, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  Save,
  Activity,
  ArrowRight
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { SearchProviderService } from "@/lib/providers/service";
import { toast } from "sonner";

type SettingsSearch = {
  tab?: string;
};

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    return {
      tab: (search.tab as string) || "profile",
    };
  },
  head: () => ({
    meta: [
      { title: "Settings · LeadFinder" },
      { name: "description", content: "Configurações e Integrações do LeadFinder" },
    ],
  }),
  component: SettingsPage,
});

type ProviderType = "openstreetmap" | "google_places" | "outscraper" | "serpapi" | "apify";

interface ProviderDetails {
  key: ProviderType;
  name: string;
  description: string;
  isPremium: boolean;
  isFree: boolean;
  isRecommended: boolean;
  docUrl: string;
}

const PROVIDERS_LIST: ProviderDetails[] = [
  {
    key: "serpapi",
    name: "SerpAPI",
    description: "Use a SerpAPI para pesquisar no Google Maps e obter leads detalhados de empresas em tempo real.",
    isPremium: true,
    isFree: false,
    isRecommended: true,
    docUrl: "https://serpapi.com/google-maps-search-api",
  },
  {
    key: "openstreetmap",
    name: "OpenStreetMap",
    description: "Provedor gratuito alimentado pelo OpenStreetMap e Overpass API.",
    isPremium: false,
    isFree: true,
    isRecommended: false,
    docUrl: "https://wiki.openstreetmap.org/wiki/Overpass_API",
  },
  {
    key: "google_places",
    name: "Google Places API",
    description: "Use a sua própria chave da API Google Places para fazer buscas de locais em tempo real.",
    isPremium: true,
    isFree: false,
    isRecommended: false,
    docUrl: "https://developers.google.com/maps/documentation/places/web-service/overview",
  },
  {
    key: "outscraper",
    name: "Outscraper",
    description: "Recomendado para agências e geração de leads em massa com enriquecimento de e-mails.",
    isPremium: true,
    isFree: false,
    isRecommended: true,
    docUrl: "https://outscraper.com/google-maps-scraper-api/",
  },
  {
    key: "apify",
    name: "Apify",
    description: "Use atores da Apify para extrair e obter registros ricos de dados comerciais.",
    isPremium: true,
    isFree: false,
    isRecommended: false,
    docUrl: "https://apify.com/apify/google-maps-scraper",
  },
];

function SettingsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { tab: activeTab } = Route.useSearch();

  const [configureProvider, setConfigureProvider] = useState<ProviderDetails | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch logged-in user profiles
  const { data: profile } = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userData.user.id)
        .single();
      return data;
    }
  });

  // Fetch user role
  const { data: roleData } = useQuery({
    queryKey: ["is-admin-check"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { isAdmin: false };
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      return { isAdmin: !!data };
    }
  });

  // Fetch subscription
  const { data: subData } = useQuery({
    queryKey: ["user-subscription-status"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { isPro: false, trial: null };
      
      const [subRes, trialRes] = await Promise.all([
        supabase.from("subscriptions").select("*").eq("user_id", userData.user.id).maybeSingle(),
        supabase.from("trial_usage").select("*").eq("user_id", userData.user.id).maybeSingle()
      ]);

      return {
        isPro: subRes.data?.status === "active" || userData.user.email === "brandfluxsm@gmail.com",
        trial: trialRes.data,
      };
    }
  });

  // Fetch configured providers
  const { data: providers = [], refetch: refetchProviders } = useQuery({
    queryKey: ["user-api-providers"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return [];
      const { data } = await supabase
        .from("api_providers")
        .select("*")
        .eq("user_id", userData.user.id);
      return data || [];
    }
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (payload: { fullName: string; phone: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: payload.fullName, phone: payload.phone })
        .eq("id", userData.user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["current-user-profile"] });
      toast.success("Perfil atualizado com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  // Activate provider mutation
  const activateProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      // Certificar que o registro existe
      const { data: existing } = await supabase
        .from("api_providers")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("provider", provider)
        .maybeSingle();

      if (!existing) {
        // Criar registro inativo
        const { data: inserted, error: insErr } = await supabase
          .from("api_providers")
          .insert({
            user_id: userData.user.id,
            provider,
            display_name: PROVIDERS_LIST.find(p => p.key === provider)?.name || provider,
            active: false,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        
        // Atualizar para ativo (o trigger BEFORE UPDATE desativa os outros)
        const { error: actErr } = await supabase
          .from("api_providers")
          .update({ active: true, connection_status: provider === "openstreetmap" ? "connected" : "inactive" })
          .eq("id", inserted.id);
        if (actErr) throw actErr;
      } else {
        const { error } = await supabase
          .from("api_providers")
          .update({ active: true })
          .eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refetchProviders();
      qc.invalidateQueries({ queryKey: ["dashboard-kpis-and-searches"] });
      toast.success("Provedor ativado com sucesso!");
    },
    onError: (err) => toast.error(err.message),
  });

  // Save API key mutation
  const saveKeyMutation = useMutation({
    mutationFn: async (payload: { provider: string; apiKey: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Não autenticado");

      // 1. Obter ou criar o registro do provedor
      let providerId = "";
      const { data: existing } = await supabase
        .from("api_providers")
        .select("id")
        .eq("user_id", userData.user.id)
        .eq("provider", payload.provider)
        .maybeSingle();

      if (!existing) {
        const { data: inserted, error: insErr } = await supabase
          .from("api_providers")
          .insert({
            user_id: userData.user.id,
            provider: payload.provider,
            display_name: PROVIDERS_LIST.find(p => p.key === payload.provider)?.name || payload.provider,
            active: false,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        providerId = inserted.id;
      } else {
        providerId = existing.id;
      }

      // 2. Salvar/Upsert a chave na tabela protegida api_provider_keys
      const { error: keyErr } = await supabase
        .from("api_provider_keys")
        .upsert({
          provider_id: providerId,
          api_key: payload.apiKey,
        }, { onConflict: "provider_id" });

      if (keyErr) throw keyErr;

      // 3. Atualizar status de conexão
      const { error: updErr } = await supabase
        .from("api_providers")
        .update({ connection_status: "connected" })
        .eq("id", providerId);

      if (updErr) throw updErr;
    },
    onSuccess: () => {
      refetchProviders();
      toast.success("Credenciais salvas com sucesso!");
      setConfigureProvider(null);
      setApiKeyInput("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleTestConnection = async (provider: string) => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await SearchProviderService.testConnection(provider);
      setTestResult(res);
      
      // Atualizar o status de conexão no banco
      const provRow = providers.find(p => p.provider === provider);
      if (provRow) {
        await supabase
          .from("api_providers")
          .update({ 
            connection_status: res.success ? "connected" : "error",
            last_connection_test: new Date().toISOString()
          })
          .eq("id", provRow.id);
        refetchProviders();
      }
    } catch (e) {
      setTestResult({ success: false, message: "Authentication Failed" });
    } finally {
      setTestingConnection(false);
    }
  };

  const openConfigure = (p: ProviderDetails) => {
    setConfigureProvider(p);
    setTestResult(null);
    setApiKeyInput("");
  };

  return (
    <AppShell title="Settings" description="Gerencie seu perfil, assinatura e provedores de busca">
      <div className="space-y-6 max-w-5xl">
        {/* Navigation Tabs */}
        <div className="flex gap-1 border-b border-border/60 pb-px overflow-x-auto">
          {[
            { id: "profile", label: "Profile", icon: User },
            { id: "billing", label: "Billing", icon: CreditCard },
            { id: "providers", label: "API Providers", icon: Cpu },
          ].map((t) => (
            <Button
              key={t.id}
              variant="ghost"
              size="sm"
              className={`rounded-none border-b-2 px-4 py-2 h-auto text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === t.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-slate-200"
              }`}
              onClick={() => navigate({ to: ".", search: { tab: t.id } })}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </Button>
          ))}
        </div>

        {/* Tab contents */}
        {activeTab === "profile" && (
          <div className="space-y-6 max-w-xl">
            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <User className="size-4 text-primary" /> Perfil de Usuário
                </CardTitle>
                <CardDescription className="text-xs">
                  Altere suas informações cadastrais básicas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    updateProfileMutation.mutate({
                      fullName: fd.get("fullName") as string,
                      phone: fd.get("phone") as string,
                    });
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Nome Completo</label>
                    <Input name="fullName" defaultValue={profile?.full_name || ""} placeholder="Seu nome" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">E-mail (Não editável)</label>
                    <Input value={profile?.email || ""} disabled className="bg-slate-900/60 text-slate-400" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Telefone de Contato</label>
                    <Input name="phone" defaultValue={profile?.phone || ""} placeholder="Ex: (11) 99999-9999" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Função na Plataforma</label>
                    <div className="flex items-center gap-2 mt-1">
                      {roleData?.isAdmin ? (
                        <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-semibold px-2 py-0.5">
                          Administrador (Admin)
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Usuário Comum
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Button type="submit" size="sm" className="text-xs font-semibold h-9" disabled={updateProfileMutation.isPending}>
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="mr-2 size-3 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-3" />
                    )}
                    Salvar Alterações
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-6 max-w-xl">
            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" /> Faturamento e Assinatura
                </CardTitle>
                <CardDescription className="text-xs">
                  Gerencie sua licença LeadFinder Pro.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 rounded-xl border border-border/40 bg-slate-900/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground font-mono block">PLANO ATUAL</span>
                    <h3 className="text-sm font-bold text-slate-100">
                      {subData?.isPro ? "✨ LeadFinder Pro Active" : "🟡 Free Trial"}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {subData?.isPro 
                        ? "Acesso ilimitado e completo a pesquisas e leads." 
                        : "Você possui 1 pesquisa gratuita liberando até 20 resultados."}
                    </p>
                  </div>
                  {!subData?.isPro && (
                    <Button size="sm" onClick={() => navigate({ to: "/pricing" })} className="bg-primary hover:bg-primary/95 text-xs font-semibold h-9">
                      Upgrade to Pro (US$25/month)
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-slate-300">Recursos inclusos no Pro:</h4>
                  <ul className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                    <li className="flex items-center gap-1.5"><Check className="size-3 text-emerald-400" /> Buscas de Leads Ilimitadas</li>
                    <li className="flex items-center gap-1.5"><Check className="size-3 text-emerald-400" /> Resultados limpos (sem Blur)</li>
                    <li className="flex items-center gap-1.5"><Check className="size-3 text-emerald-400" /> CRM integrado ilimitado</li>
                    <li className="flex items-center gap-1.5"><Check className="size-3 text-emerald-400" /> Filtros por CEP estruturado</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "providers" && (
          <div className="space-y-10">
            {/* Banner superior */}
            <div className="p-4 rounded-xl border border-border/40 bg-gradient-to-r from-slate-900/50 via-slate-900/30 to-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <h4 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
                  ⚙️ Integração com a SerpAPI
                </h4>
                <p className="text-xs md:text-sm text-slate-300">
                  Para realizar buscas no Google Maps, você pode utilizar a SerpAPI. Certifique-se de configurar e possuir saldo ou plano ativo na sua conta SerpAPI para liberar as pesquisas.
                </p>
              </div>
              <Button 
                size="sm" 
                onClick={() => {
                  const serpApi = PROVIDERS_LIST.find(p => p.key === "serpapi");
                  if (serpApi) openConfigure(serpApi);
                }} 
                className="bg-primary hover:bg-primary/95 text-xs md:text-sm font-semibold h-9 px-4 shrink-0"
              >
                Conectar SerpAPI
              </Button>
            </div>

            {/* Configure Credentials list */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">Configuração de Provedores</h3>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  Conecte suas próprias APIs para realizar buscas de leads. As chaves de API são armazenadas com criptografia rígida de ponta a ponta no banco de dados e nunca são enviadas ao navegador.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 items-stretch">
                {PROVIDERS_LIST.map((p) => {
                  const dbRecord = providers.find((db) => db.provider === p.key);
                  const isConfigured = dbRecord?.has_key_configured || p.key === "openstreetmap";
                  const isActive = dbRecord?.active || (providers.length === 0 && p.key === "openstreetmap");
                  const isSerpApi = p.key === "serpapi";

                  // Badges configuration
                  let statusText = "Necessita Chave de API";
                  let statusBadge = "border-slate-800 bg-slate-900/50 text-slate-400";
                  if (isActive) {
                    statusText = isSerpApi ? "✅ Conectado e Ativo" : "Conectado";
                    statusBadge = "border-primary/20 bg-primary/10 text-primary";
                  } else if (isConfigured) {
                    statusText = "Inativo";
                    statusBadge = "border-amber-500/20 bg-amber-500/10 text-amber-400";
                  }

                  return (
                    <Card 
                      key={p.key} 
                      className={`border relative bg-card/60 flex flex-col justify-between overflow-hidden transition-all duration-300 hover:-translate-y-1.5 h-full ${
                        isSerpApi 
                          ? "border-primary/50 shadow-md ring-1 ring-primary/20" 
                          : isActive 
                            ? "border-primary/30 bg-primary/5 hover:shadow-lg" 
                            : "border-border/60 hover:shadow-lg"
                      }`}
                    >
                      {isSerpApi && (
                        <div className="bg-slate-800 px-3 py-1.5 text-[10px] font-semibold text-slate-300 flex items-center justify-between tracking-wide select-none border-b border-border/40">
                          <span>PROVEDOR DE MAPS</span>
                          <span>GOOGLE MAPS DATA</span>
                        </div>
                      )}
                      <CardHeader className="pb-3 flex-1 flex flex-col justify-start">
                        <div className="flex items-start justify-between">
                          <div className="grid size-10 place-items-center rounded-xl bg-slate-900 border border-slate-800">
                            <Cpu className={`size-5 ${isActive ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline" className={`text-[10px] font-semibold ${statusBadge}`}>
                              {statusText}
                            </Badge>
                            <div className="flex gap-1 flex-wrap justify-end max-w-[150px]">
                              {isSerpApi ? (
                                <>
                                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-medium">
                                    Recomendado
                                  </Badge>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px] font-medium cursor-help">
                                          Requer Saldo/Plano
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="bg-slate-900 border border-slate-800 text-[11px] text-slate-200 p-2.5 max-w-xs shadow-xl">
                                        <p>A SerpAPI requer uma conta ativa com saldo ou plano contratado para executar as buscas de locais e retornar leads.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-[10px] font-medium">
                                    Fácil Configuração
                                  </Badge>
                                </>
                              ) : (
                                <>
                                  {p.isFree && <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">Grátis</Badge>}
                                  {p.isPremium && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Premium</Badge>}
                                  {p.isRecommended && <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-[10px]">Recomendado</Badge>}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <CardTitle className="text-base font-bold text-slate-100 mt-3">{p.name}</CardTitle>
                        {isSerpApi && (
                          <p className="text-xs text-amber-400/90 font-medium leading-normal mt-1">
                            Nota: Requer saldo ou plano ativo na SerpAPI para liberar pesquisas.
                          </p>
                        )}
                        <CardDescription className="text-xs md:text-sm leading-relaxed mt-1.5 min-h-[40px]">
                          {p.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-3 border-t border-border/20 flex flex-col gap-2">
                        {p.key !== "openstreetmap" && (
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="flex-1 text-xs h-9 font-semibold" 
                              onClick={() => openConfigure(p)}
                            >
                              {isSerpApi ? "Conectar SerpAPI" : "Configurar"}
                            </Button>
                            {isConfigured && (
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-xs h-9 font-semibold text-amber-400 hover:text-amber-300"
                                onClick={() => handleTestConnection(p.key)}
                              >
                                Testar
                              </Button>
                            )}
                          </div>
                        )}
                        <Button 
                          size="sm" 
                          disabled={isActive || (!isConfigured && p.key !== "openstreetmap")}
                          className="w-full text-xs h-9 font-bold"
                          onClick={() => activateProviderMutation.mutate(p.key)}
                        >
                          {isActive ? (isSerpApi ? "✅ Conectado e Ativo" : "Ativo no Momento") : "Ativar"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Marketplace Comparison */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100">Marketplace & Comparação</h3>
                <p className="text-xs md:text-sm text-muted-foreground mt-1">
                  Analise os prós e contras de cada API e selecione o provedor ideal para a sua estratégia de vendas.
                </p>
              </div>

              <Card className="border-border/60 bg-card/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="text-xs md:text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provedor</TableHead>
                        <TableHead>Custo / API</TableHead>
                        <TableHead>Dados do Maps</TableHead>
                        <TableHead>Telefones</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Extração de E-mail</TableHead>
                        <TableHead>Avaliações</TableHead>
                        <TableHead>Recomendação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { name: "SerpAPI", pricing: "Pago / Planos ou Saldo", data: "⭐⭐⭐⭐", phone: "Sim", web: "Sim", email: "Não", rating: "Sim", rec: "⭐⭐⭐⭐ Recomendado" },
                        { name: "OpenStreetMap", pricing: "Gratuito", data: "⭐⭐", phone: "Parcial", web: "Parcial", email: "Não", rating: "Não", rec: "⭐⭐ Básico" },
                        { name: "Google Places API", pricing: "$$$$ (Tarifas Google)", data: "⭐⭐⭐⭐⭐", phone: "Sim", web: "Sim", email: "Não", rating: "Sim", rec: "⭐⭐⭐⭐ Empresas" },
                        { name: "Outscraper", pricing: "$$ (Custo baixo)", data: "⭐⭐⭐⭐⭐", phone: "Sim", web: "Sim", email: "Sim (Extração)", rating: "Sim", rec: "⭐⭐⭐⭐ Agências" },
                        { name: "Apify", pricing: "$$ (Créditos)", data: "⭐⭐⭐⭐", phone: "Sim", web: "Sim", email: "Sim (Raspagem)", rating: "Sim", rec: "⭐⭐⭐ Usuários Avançados" },
                      ].map((item) => (
                        <TableRow key={item.name}>
                          <TableCell className="font-bold text-slate-200">{item.name}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{item.pricing}</TableCell>
                          <TableCell className="text-amber-400 tabular-nums">{item.data}</TableCell>
                          <TableCell className="text-slate-300">{item.phone}</TableCell>
                          <TableCell className="text-slate-300">{item.web}</TableCell>
                          <TableCell className={`font-semibold ${item.email.startsWith("Sim") ? "text-emerald-400" : "text-muted-foreground"}`}>{item.email}</TableCell>
                          <TableCell className="text-slate-300">{item.rating}</TableCell>
                          <TableCell className="font-semibold text-slate-100">{item.rec}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Configure Provider dialog modal */}
      <Dialog open={!!configureProvider} onOpenChange={(o) => !o && setConfigureProvider(null)}>
        <DialogContent className="sm:max-w-md bg-slate-950 border-border/80">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Key className="size-4 text-primary" /> Configurar {configureProvider?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Conecte sua API informando suas credenciais de acesso abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-semibold">Chave de API (API Key / Token)</label>
              <Input
                type="password"
                placeholder="Insira a chave da sua API"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
            </div>

            {testResult && (
              <div className={`p-3 rounded-lg border text-xs font-semibold flex items-center gap-2 ${
                testResult.success 
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" 
                  : "border-rose-500/20 bg-rose-500/5 text-rose-400"
              }`}>
                {testResult.success ? (
                  <>
                    <ShieldCheck className="size-4" /> ✅ Connection Successful
                  </>
                ) : (
                  <>
                    <AlertCircle className="size-4" /> ❌ {testResult.message}
                  </>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfigureProvider(null)} className="text-xs">
                Cancelar
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs text-amber-400 border-amber-500/20 hover:bg-amber-500/10"
                disabled={!apiKeyInput.trim() || testingConnection}
                onClick={() => handleTestConnection(configureProvider!.key)}
              >
                {testingConnection ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                Test Connection
              </Button>
              <Button 
                size="sm" 
                className="text-xs font-semibold"
                disabled={!apiKeyInput.trim() || saveKeyMutation.isPending}
                onClick={() => saveKeyMutation.mutate({ provider: configureProvider!.key, apiKey: apiKeyInput })}
              >
                {saveKeyMutation.isPending ? <Loader2 className="size-3 animate-spin mr-1.5" /> : null}
                Save Credentials
              </Button>
            </div>
            
            <Separator />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Como obter credenciais?</span>
              <a href={configureProvider?.docUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                Ver Documentação <ExternalLink className="size-2.5" />
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
