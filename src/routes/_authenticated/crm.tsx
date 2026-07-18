import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Star,
  Phone,
  MessageCircle,
  Globe,
  Mail,
  MapPin,
  ExternalLink,
  Search as SearchIcon,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { formatPhoneBR, telLink, whatsappLink } from "@/lib/format";
import { toast } from "sonner";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type Status = Database["public"]["Enums"]["lead_status"];

const STATUS_LABELS: Record<Status, string> = {
  novo: "Novo",
  contatado: "Contato realizado",
  respondeu: "Respondeu",
  negociacao: "Negociação",
  cliente: "Cliente",
  perdido: "Perdido",
};

const STATUS_TONES: Record<Status, string> = {
  novo: "bg-slate-500/15 text-slate-300",
  contatado: "bg-blue-500/15 text-blue-300",
  respondeu: "bg-cyan-500/15 text-cyan-300",
  negociacao: "bg-amber-500/15 text-amber-300",
  cliente: "bg-emerald-500/15 text-emerald-300",
  perdido: "bg-rose-500/15 text-rose-300",
};

const OPP_TONES: Record<string, string> = {
  alta: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  media: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  baixa: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => ({
    meta: [
      { title: "CRM · LeadFinder" },
      { name: "description", content: "Organize seus leads." },
    ],
  }),
  component: CrmPage,
});

const PAGE_SIZE = 25;

function CrmPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [onlyNoWeb, setOnlyNoWeb] = useState(false);
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [onlyEmail, setOnlyEmail] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Company | null>(null);

  const { data } = useQuery({
    queryKey: ["companies", { query, onlyNoWeb, onlyPhone, onlyEmail, page }],
    queryFn: async () => {
      let q = supabase
        .from("companies")
        .select("*", { count: "exact" })
        .eq("favorite", true); // List only favorited (starred) companies in the CRM

      if (query.trim()) {
        const like = `%${query.trim()}%`;
        q = q.or(`name.ilike.${like},category.ilike.${like},city.ilike.${like}`);
      }
      if (onlyNoWeb) q = q.or("website.is.null,website.eq.");
      if (onlyPhone) q = q.not("phone", "is", null).neq("phone", "");
      if (onlyEmail) q = q.not("email", "is", null).neq("email", "");

      q = q
        .order("lead_score", { ascending: false })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const updateMut = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<Company> }) => {
      const { error } = await supabase
        .from("companies")
        .update(payload.patch)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      toast.success("Lead deletado com sucesso!");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao deletar lead"),
  });

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja deletar este lead?")) {
      deleteMut.mutate(id);
    }
  };

  return (
    <AppShell title="CRM" description={`${total} empresa${total === 1 ? "" : "s"}`}>
      <Card className="border-border/60 bg-card/60 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, categoria ou cidade"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <FilterToggle label="Sem site" checked={onlyNoWeb} onChange={(v) => { setOnlyNoWeb(v); setPage(0); }} />
          <FilterToggle label="Com telefone" checked={onlyPhone} onChange={(v) => { setOnlyPhone(v); setPage(0); }} />
          <FilterToggle label="Com e-mail" checked={onlyEmail} onChange={(v) => { setOnlyEmail(v); setPage(0); }} />
        </div>
      </Card>

      <Card className="mt-4 border-border/60 bg-card/60">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Oportunidade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                    Nenhuma empresa. Faça uma pesquisa para começar.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => updateMut.mutate({ id: c.id, patch: { favorite: !c.favorite } })}
                      className="p-1"
                      aria-label="Favorito"
                    >
                      <Star
                        className={
                          "size-4 " +
                          (c.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground")
                        }
                      />
                    </button>
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.category ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.phone ? formatPhoneBR(c.phone) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.website ? (
                      <a
                        href={c.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Site <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <Badge className="border-transparent bg-rose-500/15 text-rose-300">
                        Sem website
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.city ?? "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={c.status}
                      onValueChange={(v) => updateMut.mutate({ id: c.id, patch: { status: v as Status } })}
                    >
                      <SelectTrigger className="h-8 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge className={"border " + (OPP_TONES[c.opportunity] ?? OPP_TONES.baixa)}>
                      {c.opportunity.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex gap-1">
                      {telLink(c.phone) && (
                        <Button asChild size="icon" variant="ghost" title="Ligar">
                          <a href={telLink(c.phone)!}><Phone className="size-4" /></a>
                        </Button>
                      )}
                      {whatsappLink(c.phone) && (
                        <Button asChild size="icon" variant="ghost" title="WhatsApp">
                          <a href={whatsappLink(c.phone)!} target="_blank" rel="noreferrer">
                            <MessageCircle className="size-4 text-emerald-400" />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Deletar"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs text-muted-foreground">
            <div>Página {page + 1} de {pages}</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      <CompanyDrawer
        company={selected}
        onClose={() => setSelected(null)}
        onUpdate={(patch) => selected && updateMut.mutate({ id: selected.id, patch })}
        onDelete={(id) => deleteMut.mutate(id)}
      />
    </AppShell>
  );
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-xs">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      {label}
    </label>
  );
}

function CompanyDrawer({
  company,
  onClose,
  onUpdate,
  onDelete,
}: {
  company: Company | null;
  onClose: () => void;
  onUpdate: (patch: Partial<Company>) => void;
  onDelete: (id: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [lastContact, setLastContact] = useState("");
  const [nextContact, setNextContact] = useState("");

  // Reset notes when a different company opens
  useMemo(() => {
    setNotes(company?.notes ?? "");
    setNotesDirty(false);
    setLastContact(company?.last_contact_at ? company.last_contact_at.split("T")[0] : "");
    setNextContact(company?.next_contact_at ? company.next_contact_at.split("T")[0] : "");
  }, [company?.id]);

  const wa = whatsappLink(company?.phone);
  const tel = telLink(company?.phone);
  const mapsUrl =
    company?.latitude != null && company?.longitude != null
      ? `https://www.openstreetmap.org/?mlat=${company.latitude}&mlon=${company.longitude}#map=18/${company.latitude}/${company.longitude}`
      : null;

  return (
    <Sheet open={!!company} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {company && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8">{company.name}</SheetTitle>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className={"border " + (OPP_TONES[company.opportunity] ?? OPP_TONES.baixa)}>
                Oportunidade {company.opportunity}
              </Badge>
              <Badge className={"border-transparent " + STATUS_TONES[company.status]}>
                {STATUS_LABELS[company.status]}
              </Badge>
              {(!company.website || company.website.trim() === "") && (
                <Badge className="border-transparent bg-rose-500/15 text-rose-300">Sem website</Badge>
              )}
            </div>

            <div className="mt-6 space-y-3 text-sm">
              <InfoRow icon={<MapPin className="size-4" />} label="Endereço">
                {[company.address, company.city, company.state, company.country]
                  .filter(Boolean).join(" · ") || "—"}
              </InfoRow>
              <InfoRow icon={<Phone className="size-4" />} label="Telefone">
                {company.phone ? formatPhoneBR(company.phone) : "—"}
              </InfoRow>
              <InfoRow icon={<Mail className="size-4" />} label="E-mail">
                {company.email ?? "—"}
              </InfoRow>
              <InfoRow icon={<Globe className="size-4" />} label="Website">
                {company.website ? (
                  <a href={company.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {company.website}
                  </a>
                ) : "—"}
              </InfoRow>
              <InfoRow icon={<span className="text-xs">🏷️</span>} label="Categoria">
                {company.category ?? "—"}
              </InfoRow>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {tel && (
                <Button asChild variant="outline" size="sm"><a href={tel}><Phone className="mr-2 size-4" />Ligar</a></Button>
              )}
              {wa && (
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500">
                  <a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 size-4" />WhatsApp</a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdate({ favorite: !company.favorite })}
              >
                <Star className={"mr-2 size-4 " + (company.favorite ? "fill-amber-400 text-amber-400" : "")} />
                {company.favorite ? "Desfavoritar" : "Favoritar"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Tem certeza que deseja deletar este lead?")) {
                    onDelete(company.id);
                    onClose();
                  }
                }}
              >
                <Trash2 className="mr-2 size-4" />
                Deletar
              </Button>
              {mapsUrl && (
                <Button asChild variant="ghost" size="sm">
                  <a href={mapsUrl} target="_blank" rel="noreferrer"><MapPin className="mr-2 size-4" />Mapa</a>
                </Button>
              )}
            </div>

            <Separator className="my-6" />

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={company.status} onValueChange={(v) => onUpdate({ status: v as Status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Último Contato</Label>
                <input
                  type="date"
                  value={lastContact}
                  onChange={(e) => setLastContact(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-slate-200"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Próximo Contato</Label>
                <input
                  type="date"
                  value={nextContact}
                  onChange={(e) => setNextContact(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-slate-200"
                />
              </div>
            </div>
            
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onUpdate({
                    last_contact_at: lastContact ? new Date(lastContact).toISOString() : null,
                    next_contact_at: nextContact ? new Date(nextContact).toISOString() : null,
                  });
                  toast.success("Datas de contato atualizadas.");
                }}
              >
                Salvar Datas
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              <Label>Observações</Label>
              <Textarea
                rows={5}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                placeholder="Ex.: Liguei hoje. Pediram orçamento."
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!notesDirty}
                  onClick={() => {
                    onUpdate({ notes });
                    setNotesDirty(false);
                    toast.success("Observações salvas");
                  }}
                >
                  Salvar
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}