import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Loader2, Check, X, Phone, Mail, User, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPhoneBR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context }) => {
    // Restringe acesso apenas a usuários com perfil 'admin'
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (error || !data) {
      toast.error("Acesso restrito apenas ao administrador.");
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Painel Adm · LeadFinder" },
      { name: "description", content: "Gerenciamento de acessos dos usuários." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const [profilesRes, rolesRes, subsRes, trialRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
        supabase.from("subscriptions").select("*"),
        supabase.from("trial_usage").select("*"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const rolesMap = new Map(rolesRes.data?.map((r) => [r.user_id, r.role]) ?? []);
      const subsMap = new Map(subsRes.data?.map((s) => [s.user_id, s]) ?? []);
      const trialMap = new Map(trialRes.data?.map((t) => [t.user_id, t]) ?? []);

      return (profilesRes.data ?? []).map((p) => ({
        ...p,
        role: rolesMap.get(p.id) || "user",
        subscription: subsMap.get(p.id) || null,
        trial: trialMap.get(p.id) || null,
      }));
    },
  });

  const toggleApprovalMutation = useMutation({
    mutationFn: async (payload: { id: string; is_approved: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ is_approved: payload.is_approved })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("Acesso do usuário atualizado!");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar acesso");
    },
  });

  const toggleProMutation = useMutation({
    mutationFn: async (payload: { userId: string; isPro: boolean }) => {
      const status = payload.isPro ? "active" : "inactive";

      const { data: existing } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", payload.userId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            status,
            current_period_end: payload.isPro
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
              : null, // 1 year period end
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", payload.userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscriptions").insert({
          user_id: payload.userId,
          status,
          current_period_end: payload.isPro
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      toast.success("Plano do usuário atualizado!");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar plano");
    },
  });

  return (
    <AppShell
      title="Painel Administrativo"
      description="Aprovação e gerenciamento de acessos de novos usuários."
    >
      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            Usuários Cadastrados
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-12">
              Nenhum usuário cadastrado.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Nível de Acesso</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Data de Cadastro</TableHead>
                    <TableHead className="text-right">Permissão de Busca</TableHead>
                    <TableHead className="text-right">Acesso Pro Manual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const formattedDate = new Date(u.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    });

                    const isSelfAdmin = u.email === "brandfluxsm@gmail.com";

                    // Subscription and trial calculations
                    const sub = u.subscription;
                    const isPro = sub?.status === "active" || u.email === "brandfluxsm@gmail.com";
                    const trial = u.trial;
                    const searchesUsed = trial?.searches_used ?? 0;
                    const isTrialFinished = trial?.trial_finished || searchesUsed >= 1;

                    return (
                      <TableRow key={u.id} className="hover:bg-slate-900/40">
                        <TableCell className="font-medium text-slate-200">
                          <div className="flex items-center gap-2">
                            <div className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
                              <User className="size-3.5" />
                            </div>
                            <span>{u.full_name || "Sem Nome"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <Mail className="size-3 text-muted-foreground" />
                            {u.email || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-200">
                          {u.phone ? (
                            <div className="flex items-center gap-1.5">
                              <Phone className="size-3 text-muted-foreground" />
                              {formatPhoneBR(u.phone)}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {u.role === "admin" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                              <ShieldCheck className="size-3" /> Administrador
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5">
                              Usuário Comum
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isPro ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                              ✨ Pro Ativo
                            </span>
                          ) : isTrialFinished ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded px-1.5 py-0.5">
                              🔒 Trial Expirado ({searchesUsed}/1)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-400 bg-yellow-500/5 border border-yellow-500/20 rounded px-1.5 py-0.5">
                              🟡 Free Trial ({searchesUsed}/1)
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {formattedDate}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span
                              className={`text-[10px] font-medium ${u.is_approved ? "text-emerald-400" : "text-rose-400"}`}
                            >
                              {u.is_approved ? "Autorizado" : "Bloqueado"}
                            </span>
                            <Switch
                              checked={u.is_approved}
                              disabled={isSelfAdmin || toggleApprovalMutation.isPending}
                              onCheckedChange={(checked) =>
                                toggleApprovalMutation.mutate({ id: u.id, is_approved: checked })
                              }
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span
                              className={`text-[10px] font-medium ${isPro ? "text-emerald-400" : "text-slate-400"}`}
                            >
                              {isPro ? "Pro Ativo" : "Inativo"}
                            </span>
                            <Switch
                              checked={isPro}
                              disabled={isSelfAdmin || toggleProMutation.isPending}
                              onCheckedChange={(checked) =>
                                toggleProMutation.mutate({ userId: u.id, isPro: checked })
                              }
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
