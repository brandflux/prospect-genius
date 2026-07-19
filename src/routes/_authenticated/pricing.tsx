import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ShieldCheck, Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing · LeadFinder" },
      { name: "description", content: "Escolha o seu plano LeadFinder Pro." },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [checkoutSimulated, setCheckoutSimulated] = useState(false);

  // Query subscription status
  const { data: subData, isLoading } = useQuery({
    queryKey: ["user-subscription-status"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return { isPro: false, userId: null };
      const { data } = await supabase
        .from("subscriptions")
        .select("status")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      return {
        isPro: data?.status === "active" || userData.user.email === "brandfluxsm@gmail.com",
        userId: userData.user.id,
      };
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      if (!subData?.userId) throw new Error("Usuário não logado.");

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: "price_1TuvTV5CsIADizM8y5mwvMcH", // Substitua pelo seu ID de Preço do Stripe
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error("Não foi possível gerar a URL de checkout.");

      // Redireciona o usuário para a página segura de pagamento do Stripe
      window.location.href = data.url;
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao abrir checkout do Stripe.");
      setCheckoutSimulated(false);
    },
  });

  const handleUpgrade = () => {
    setCheckoutSimulated(true);
    upgradeMutation.mutate();
  };

  const proFeatures = [
    "Unlimited Business Searches",
    "Unlimited Results",
    "CRM Included",
    "Favorites",
    "Notes",
    "Saved Searches",
    "Radius Search",
    "ZIP Code Search",
    "Current Location Search",
    "Future Updates Included",
  ];

  return (
    <AppShell title="Pricing" description="Find local businesses and prospect high-quality leads.">
      {checkoutSimulated ? (
        <div className="flex flex-col items-center justify-center text-center py-24 space-y-6 max-w-md mx-auto">
          <div className="relative">
            <div className="size-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <div className="absolute inset-0 grid place-items-center">
              <Sparkles className="size-5 text-primary animate-pulse" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-100">Abrindo Checkout Seguro...</h2>
            <p className="text-sm text-muted-foreground">
              Conectando com o Stripe Checkout para simular a assinatura de sua conta com segurança.
              Não feche esta janela.
            </p>
          </div>
          <div className="w-full bg-slate-900/50 rounded-lg p-3 text-[10px] text-muted-foreground border border-border/40 font-mono">
            POST /v1/checkout/sessions... 200 OK
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 px-4">
          {/* Header Section */}
          <div className="text-center max-w-2xl space-y-3 mb-10">
            <Badge
              variant="outline"
              className="text-xs border-primary/20 text-primary bg-primary/5 px-3 py-1 font-semibold uppercase tracking-wider"
            >
              ✨ LeadFinder Pro
            </Badge>
            <h1 className="text-3xl font-extrabold text-slate-100 md:text-4xl tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              Find Businesses Before Your Competitors
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Find local businesses, organize your leads and manage your sales pipeline with one
              simple platform.
            </p>
          </div>

          {/* Pricing Grid */}
          <div className="w-full max-w-md">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : subData?.isPro ? (
              <Card className="relative overflow-hidden border-primary bg-primary/5 shadow-lg shadow-primary/5">
                <div className="absolute -right-8 -top-8 size-20 bg-primary/25 rounded-full blur-xl" />
                <CardHeader className="text-center pb-6">
                  <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary/10 text-primary mb-3">
                    <ShieldCheck className="size-6" />
                  </div>
                  <CardTitle className="text-xl font-bold text-slate-100">
                    Sua Assinatura está Ativa!
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Você é membro do plano LeadFinder Pro.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center py-4 bg-slate-900/40 rounded-xl border border-border/60">
                    <span className="text-xs text-muted-foreground block">Valor cobrado</span>
                    <span className="text-2xl font-bold text-slate-100">US$ 25/mês</span>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => navigate({ to: "/search" })}
                  >
                    Ir para Buscar Empresas
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="relative overflow-hidden border-border/80 bg-card/70 shadow-xl ring-1 ring-border/20">
                {/* Visual Glow */}
                <div className="absolute -left-12 -bottom-12 size-36 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -right-12 -top-12 size-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

                <CardHeader className="pb-4 border-b border-border/20">
                  <span className="text-xs font-semibold text-primary uppercase tracking-wider block mb-1">
                    PRO PLAN
                  </span>
                  <CardTitle className="text-2xl font-bold text-slate-100">
                    LeadFinder Pro
                  </CardTitle>
                  <div className="flex items-baseline gap-1 mt-3">
                    <span className="text-3xl font-extrabold text-slate-100 tracking-tight">
                      US$ 25
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">/month</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground block mt-1">
                    Cobrança recorrente mensal. Cancele quando quiser.
                  </span>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Features List */}
                  <ul className="space-y-3">
                    {proFeatures.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <Check className="size-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Checkout Button */}
                  <Button
                    className="w-full h-11 text-xs font-semibold text-white bg-primary hover:bg-primary/95 transition-all shadow-md shadow-primary/20"
                    onClick={handleUpgrade}
                  >
                    Start for US$25/month
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

// Simple Badge component for styling within the page if not loaded elsewhere
function Badge({
  children,
  variant,
  className,
}: {
  children: React.ReactNode;
  variant?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  );
}
