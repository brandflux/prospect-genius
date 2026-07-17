import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORY_PRESETS,
  bboxFromNominatim,
  geocodeCity,
  overpassSearch,
} from "@/lib/overpass";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Buscar empresas · LeadFinder" },
      { name: "description", content: "Busca de empresas via OpenStreetMap." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const navigate = useNavigate();
  const [category, setCategory] = useState("restaurant");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [country, setCountry] = useState("Brasil");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim()) return toast.error("Informe a cidade.");
    const preset = CATEGORY_PRESETS.find((c) => c.value === category);
    if (!preset) return toast.error("Categoria inválida.");

    setLoading(true);
    try {
      const geo = await geocodeCity({ city, state: stateVal, country });
      if (!geo) throw new Error("Cidade não encontrada.");
      const pois = await overpassSearch({
        bbox: bboxFromNominatim(geo),
        filters: preset.filters,
        limit: 200,
      });

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Faça login novamente.");

      const { data: search, error: searchErr } = await supabase
        .from("searches")
        .insert({
          user_id: user.id,
          keyword: preset.label,
          city,
          state: stateVal || null,
          country: country || null,
          result_count: pois.length,
          total_results: pois.length,
        })
        .select("id")
        .single();
      if (searchErr) throw searchErr;

      if (pois.length > 0) {
        const rows = pois.map((p) => ({
          user_id: user.id,
          search_id: search.id,
          osm_id: p.osm_id,
          name: p.name,
          category: p.category,
          phone: p.phone,
          email: p.email,
          website: p.website,
          address: p.address,
          city: p.city || city,
          state: p.state || stateVal || null,
          country: p.country || country || null,
          latitude: p.latitude,
          longitude: p.longitude,
        }));
        const { error: upErr } = await supabase
          .from("companies")
          .upsert(rows, { onConflict: "user_id,osm_id", ignoreDuplicates: false });
        if (upErr) throw upErr;
      }

      toast.success(`${pois.length} empresas encontradas.`);
      navigate({ to: "/crm" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro na busca.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="Buscar empresas"
      description="Fonte: OpenStreetMap + Overpass API (100% gratuito)"
    >
      <Card className="border-border/60 bg-card/60 p-6">
        <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-6">
          <div className="md:col-span-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORY_PRESETS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Cidade</Label>
            <Input placeholder="São Paulo" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label>Estado</Label>
            <Input placeholder="SP" value={stateVal} onChange={(e) => setStateVal(e.target.value)} />
          </div>
          <div>
            <Label>País</Label>
            <Input placeholder="Brasil" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
          <div className="md:col-span-6 flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <SearchIcon className="mr-2 size-4" />}
              Pesquisar
            </Button>
          </div>
        </form>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Dica: quanto maior a cidade, mais tempo a busca demora. Os resultados são salvos automaticamente no CRM.
      </p>
    </AppShell>
  );
}