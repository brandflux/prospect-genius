import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search as SearchIcon, 
  Loader2, 
  MapPin, 
  Star, 
  Phone, 
  MessageCircle, 
  Globe, 
  Mail, 
  History, 
  ArrowUpDown, 
  ChevronRight, 
  Calendar,
  ExternalLink
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  overpassSearchAround, 
  calculateDistance, 
  geocodeAddress,
  type OsmPoi 
} from "@/lib/overpass";
import { Map } from "@/components/map";
import { toast } from "sonner";
import { formatPhoneBR, telLink, whatsappLink } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type Company = Database["public"]["Tables"]["companies"]["Row"];
type SearchHistoryItem = Database["public"]["Tables"]["searches"]["Row"];
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

export const Route = createFileRoute("/_authenticated/search")({
  head: () => ({
    meta: [
      { title: "Buscar Empresas · LeadFinder" },
      { name: "description", content: "Localize empresas ao redor de uma área geográfica." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => {
    return {
      searchId: (search.searchId as string) || undefined,
    };
  },
  component: SearchPage,
});

function SearchPage() {
  const { searchId } = Route.useSearch();
  const qc = useQueryClient();
  const [searchMode, setSearchMode] = useState<"gps" | "cep">("gps");
  const [categoryInput, setCategoryInput] = useState("");
  const [isCategoryFocused, setIsCategoryFocused] = useState(false);
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  
  // Coordinates state (Default to São Paulo center)
  const [lat, setLat] = useState(-23.55052);
  const [lon, setLon] = useState(-46.633308);
  const [radiusKm, setRadiusKm] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OsmPoi[]>([]);
  const [selectedSearchId, setSelectedSearchId] = useState<string | null>(null);

  // Load search from query param searchId
  useEffect(() => {
    if (searchId) {
      const loadHistory = async () => {
        const { data, error } = await supabase
          .from("searches")
          .select("*")
          .eq("id", searchId)
          .single();
        if (error) {
          toast.error("Erro ao carregar busca do histórico.");
        } else if (data) {
          loadSearchFromHistory(data);
        }
      };
      loadHistory();
    }
  }, [searchId]);

  // Sorting state
  const [sortKey, setSortKey] = useState<"distance" | "name" | "category" | "no-website" | "phone" | "email">("distance");
  const [sortAsc, setSortAsc] = useState(true);

  // Selected company for CRM Drawer
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Fetch recent searches
  const { data: recentSearches = [], refetch: refetchSearches } = useQuery({
    queryKey: ["recent-searches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("searches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Query selected company from Supabase for editing
  const { data: selectedCompany = null } = useQuery({
    queryKey: ["company-detail", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", selectedCompanyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCompanyId,
  });

  // Save changes to company in Supabase
  const updateCompanyMutation = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<Company> }) => {
      const { error } = await supabase
        .from("companies")
        .update(payload.patch)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-detail", selectedCompanyId] });
      qc.invalidateQueries({ queryKey: ["recent-searches"] });
      toast.success("Empresa atualizada com sucesso");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao atualizar"),
  });

  // Autocomplete suggestions
  const filteredSuggestions = useMemo(() => {
    if (!categoryInput) return CATEGORY_PRESETS;
    return CATEGORY_PRESETS.filter(
      (c) =>
        c.label.toLowerCase().includes(categoryInput.toLowerCase()) ||
        c.value.toLowerCase().includes(categoryInput.toLowerCase())
    );
  }, [categoryInput]);

  // Cep autofill logic
  useEffect(() => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length === 8) {
      const fetchCep = async () => {
        setLoading(true);
        try {
          const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
          const data = await res.json();
          if (data.erro) {
            toast.error("CEP não encontrado.");
            setRua("");
            setBairro("");
            setCidade("");
            setEstado("");
            return;
          }
          setRua(data.logradouro || "");
          setBairro(data.bairro || "");
          setCidade(data.localidade || "");
          setEstado(data.uf || "");

          // Convert to coordinates using Nominatim
          const addressStr = `${data.logradouro || ""}, ${data.bairro || ""}, ${data.localidade || ""}, ${data.uf || ""}, Brasil`;
          const geo = await geocodeAddress(addressStr);
          if (geo) {
            setLat(parseFloat(geo.lat));
            setLon(parseFloat(geo.lon));
          } else {
            // Try with city/state if full address fails
            const fallbackGeo = await geocodeAddress(`${data.localidade || ""}, ${data.uf || ""}, Brasil`);
            if (fallbackGeo) {
              setLat(parseFloat(fallbackGeo.lat));
              setLon(parseFloat(fallbackGeo.lon));
            } else {
              toast.warning("Não foi possível localizar as coordenadas exatas deste CEP no mapa.");
            }
          }
        } catch (err) {
          toast.error("Erro ao buscar o CEP.");
        } finally {
          setLoading(false);
        }
      };
      fetchCep();
    }
  }, [cep]);

  // GPS Geolocation logic
  const handleGPSLocation = () => {
    if (!navigator.geolocation) {
      return toast.error("Seu navegador não suporta geolocalização.");
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        setLat(latitude);
        setLon(longitude);
        setRadiusKm(5); // Initial 5km radius for GPS

        // Reverse geocoding to find city/state
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          if (res.ok) {
            const data = await res.json();
            const address = data.address || {};
            setCidade(address.city || address.town || address.village || "");
            setEstado(address.state || "");
          }
        } catch (e) {
          console.error("Erro ao reverter geocodificação:", e);
        } finally {
          setLoading(false);
          toast.success("Localização obtida com sucesso!");
        }
      },
      (err) => {
        setLoading(false);
        toast.error("Permissão de localização negada ou indisponível.");
      }
    );
  };

  // Run Search
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryInput.trim()) return toast.error("Informe a categoria de busca.");

    setLoading(true);
    setResults([]);
    try {
      const selectedPreset = CATEGORY_PRESETS.find(
        (c) => c.label.toLowerCase() === categoryInput.toLowerCase()
      );
      
      const filters = selectedPreset 
        ? selectedPreset.filters 
        : [
            `["amenity"~"${categoryInput.trim().toLowerCase()}",i]`,
            `["shop"~"${categoryInput.trim().toLowerCase()}",i]`,
            `["office"~"${categoryInput.trim().toLowerCase()}",i]`,
            `["leisure"~"${categoryInput.trim().toLowerCase()}",i]`,
            `["craft"~"${categoryInput.trim().toLowerCase()}",i]`
          ];

      const radiusMeters = radiusKm * 1000;
      const pois = await overpassSearchAround({
        lat,
        lon,
        radiusMeters,
        filters,
        limit: 200,
      });

      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("Usuário não autenticado.");

      // Save search history
      const { data: searchRecord, error: searchErr } = await supabase
        .from("searches")
        .insert({
          user_id: user.id,
          keyword: categoryInput,
          city: cidade || null,
          state: estado || null,
          radius_km: radiusKm,
          result_count: pois.length,
          total_results: pois.length,
          cep: searchMode === "cep" ? cep : null,
          latitude: lat,
          longitude: lon,
        })
        .select("id")
        .single();

      if (searchErr) throw searchErr;
      setSelectedSearchId(searchRecord.id);

      // Save found companies to Supabase
      if (pois.length > 0) {
        const rows = pois.map((p) => ({
          user_id: user.id,
          search_id: searchRecord.id,
          osm_id: p.osm_id,
          name: p.name,
          category: p.category || categoryInput,
          phone: p.phone,
          email: p.email,
          website: p.website,
          address: p.address,
          city: p.city || cidade || null,
          state: p.state || estado || null,
          latitude: p.latitude,
          longitude: p.longitude,
        }));

        const { error: upErr } = await supabase
          .from("companies")
          .upsert(rows, { onConflict: "user_id,osm_id", ignoreDuplicates: false });

        if (upErr) throw upErr;
      }

      // Add calculated distances for display
      const withDistance = pois.map((p) => {
        let dist = 0;
        if (p.latitude != null && p.longitude != null) {
          dist = calculateDistance(lat, lon, p.latitude, p.longitude);
        }
        return { ...p, distanceKm: dist };
      });

      setResults(withDistance);
      toast.success(`${pois.length} empresas encontradas e salvas.`);
      refetchSearches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na pesquisa.");
    } finally {
      setLoading(false);
    }
  };

  // Load a search from history
  const loadSearchFromHistory = async (hist: SearchHistoryItem) => {
    setLoading(true);
    try {
      setCategoryInput(hist.keyword);
      setRadiusKm(hist.radius_km);
      if (hist.latitude && hist.longitude) {
        setLat(hist.latitude);
        setLon(hist.longitude);
      }
      if (hist.cep) {
        setSearchMode("cep");
        setCep(hist.cep);
      } else {
        setSearchMode("gps");
        setCep("");
      }
      setCidade(hist.city || "");
      setEstado(hist.state || "");
      setSelectedSearchId(hist.id);

      // Load companies linked to this search from Supabase directly (avoids API calls)
      const { data: comps, error } = await supabase
        .from("companies")
        .select("*")
        .eq("search_id", hist.id);

      if (error) throw error;

      if (comps && comps.length > 0) {
        const formatted = comps.map((c) => ({
          osm_id: c.osm_id || "",
          name: c.name,
          category: c.category,
          phone: c.phone,
          email: c.email,
          website: c.website,
          address: c.address,
          city: c.city,
          state: c.state,
          country: c.country,
          latitude: c.latitude,
          longitude: c.longitude,
          distanceKm: (c.latitude != null && c.longitude != null && hist.latitude != null && hist.longitude != null)
            ? calculateDistance(hist.latitude, hist.longitude, c.latitude, c.longitude)
            : 0,
        }));
        setResults(formatted);
        toast.success(`Carregadas ${comps.length} empresas do histórico.`);
      } else {
        setResults([]);
        toast.info("Nenhuma empresa salva nesta pesquisa.");
      }
    } catch (err) {
      toast.error("Erro ao carregar pesquisa do histórico.");
    } finally {
      setLoading(false);
    }
  };

  // Handle direct favorite toggle on result list
  const toggleFavoriteOnResult = async (osmId: string, currentFav: boolean) => {
    try {
      // Find database record matching osm_id
      const { data: record } = await supabase
        .from("companies")
        .select("id, favorite")
        .eq("osm_id", osmId)
        .maybeSingle();

      if (record) {
        const { error } = await supabase
          .from("companies")
          .update({ favorite: !record.favorite })
          .eq("id", record.id);

        if (error) throw error;
        toast.success("Status de favorito atualizado.");
        
        // If drawer is open, refresh it
        if (selectedCompanyId === record.id) {
          qc.invalidateQueries({ queryKey: ["company-detail", selectedCompanyId] });
        }
      }
    } catch (err) {
      toast.error("Erro ao atualizar favorito.");
    }
  };

  // Open drawer for detailed CRM editing
  const handleOpenCRMDetails = async (osmId: string) => {
    try {
      const { data } = await supabase
        .from("companies")
        .select("id")
        .eq("osm_id", osmId)
        .maybeSingle();

      if (data) {
        setSelectedCompanyId(data.id);
      } else {
        toast.error("Lead não cadastrado no banco de dados local.");
      }
    } catch (err) {
      toast.error("Erro ao carregar detalhes.");
    }
  };

  // Change company status directly from result row
  const handleStatusChangeOnResult = async (osmId: string, status: Status) => {
    try {
      const { data: record } = await supabase
        .from("companies")
        .select("id")
        .eq("osm_id", osmId)
        .maybeSingle();

      if (record) {
        const { error } = await supabase
          .from("companies")
          .update({ status })
          .eq("id", record.id);

        if (error) throw error;
        toast.success("Status CRM atualizado.");
      }
    } catch (err) {
      toast.error("Erro ao atualizar status.");
    }
  };

  // Map markers mapping
  const mapMarkers = useMemo(() => {
    return results
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => ({
        id: r.osm_id,
        name: r.name,
        latitude: r.latitude!,
        longitude: r.longitude!,
        category: r.category,
        address: r.address,
      }));
  }, [results]);

  // Sort results
  const sortedResults = useMemo(() => {
    const data = [...results];
    data.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      switch (sortKey) {
        case "distance":
          valA = a.distanceKm ?? 9999;
          valB = b.distanceKm ?? 9999;
          break;
        case "name":
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case "category":
          valA = (a.category || "").toLowerCase();
          valB = (b.category || "").toLowerCase();
          break;
        case "no-website":
          valA = a.website ? 1 : 0;
          valB = b.website ? 1 : 0;
          break;
        case "phone":
          valA = a.phone ? 0 : 1;
          valB = b.phone ? 0 : 1;
          break;
        case "email":
          valA = a.email ? 0 : 1;
          valB = b.email ? 0 : 1;
          break;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return data;
  }, [results, sortKey, sortAsc]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  return (
    <AppShell title="Buscar Empresas" description="Fonte de dados: OpenStreetMap + Overpass API">
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Controls & History */}
        <div className="space-y-6 lg:col-span-1">
          {/* Controls Card */}
          <Card className="border-border/60 bg-card/60">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Configuração da Pesquisa</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-4">
                {/* Category autocomplete input */}
                <div className="relative">
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    placeholder="Ex: Restaurante, Marmoraria, Dentista..."
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    onFocus={() => setIsCategoryFocused(true)}
                    onBlur={() => setTimeout(() => setIsCategoryFocused(false), 200)}
                    required
                  />
                  {isCategoryFocused && filteredSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border/80 bg-popover text-popover-foreground shadow-md">
                      {filteredSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.value}
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={() => setCategoryInput(suggestion.label)}
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Switch Mode tabs */}
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-950 p-1">
                  <button
                    type="button"
                    onClick={() => setSearchMode("gps")}
                    className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                      searchMode === "gps" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    📍 Localização Atual
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode("cep")}
                    className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                      searchMode === "cep" ? "bg-primary text-white" : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    📬 CEP
                  </button>
                </div>

                {searchMode === "gps" ? (
                  <div className="space-y-2">
                    <Label>Localização</Label>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={handleGPSLocation}
                      disabled={loading}
                    >
                      <MapPin className="mr-2 size-4 text-primary" />
                      Obter localização do navegador
                    </Button>
                    {(cidade || estado) && (
                      <p className="text-[11px] text-muted-foreground text-center">
                        Detectado: {cidade} - {estado}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 border-t border-border/20 pt-3">
                    <div>
                      <Label htmlFor="cep">CEP</Label>
                      <Input
                        id="cep"
                        placeholder="01001-000"
                        maxLength={9}
                        value={cep}
                        onChange={(e) => setCep(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Cidade</Label>
                        <Input value={cidade} disabled className="bg-slate-900/40" />
                      </div>
                      <div>
                        <Label>UF</Label>
                        <Input value={estado} disabled className="bg-slate-900/40" />
                      </div>
                    </div>
                    <div>
                      <Label>Endereço</Label>
                      <Input value={rua ? `${rua} - ${bairro}` : ""} disabled className="bg-slate-900/40" />
                    </div>
                  </div>
                )}

                {/* Radius controls */}
                <div className="space-y-2 border-t border-border/20 pt-3">
                  <div className="flex items-center justify-between">
                    <Label>Raio de busca</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        className="h-7 w-16 text-right text-xs"
                        value={radiusKm}
                        min={1}
                        max={100}
                        onChange={(e) => setRadiusKm(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                      />
                      <span className="text-xs text-muted-foreground">km</span>
                    </div>
                  </div>
                  <Slider
                    defaultValue={[radiusKm]}
                    value={[radiusKm]}
                    onValueChange={(val) => setRadiusKm(val[0])}
                    min={1}
                    max={100}
                    step={1}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>1 km</span>
                    <span>20 km</span>
                    <span>50 km</span>
                    <span>100 km</span>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Pesquisando...
                    </>
                  ) : (
                    <>
                      <SearchIcon className="mr-2 size-4" />
                      🔍 Buscar Empresas
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* History Card */}
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <History className="size-4 text-muted-foreground" />
                Histórico de Buscas
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2">
              {recentSearches.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma busca recente.</p>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {recentSearches.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => loadSearchFromHistory(h)}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-colors hover:bg-slate-800 ${
                        selectedSearchId === h.id ? "bg-primary/10 border border-primary/20" : "bg-transparent"
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-medium text-slate-200 truncate">{h.keyword}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {h.city ? `${h.city} · ` : ""}{h.radius_km}km · {h.result_count} empresas
                        </p>
                      </div>
                      <ChevronRight className="size-3 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Map and results */}
        <div className="space-y-6 lg:col-span-2">
          {/* Map view */}
          <Card className="overflow-hidden border-border/60 bg-card/60">
            <Map 
              center={[lat, lon]} 
              radiusKm={radiusKm} 
              markers={mapMarkers} 
              onMarkerClick={(m) => handleOpenCRMDetails(m.id)}
            />
          </Card>

          {/* Results Table */}
          {results.length > 0 && (
            <Card className="border-border/60 bg-card/60">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold">
                  Resultados ({results.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/40" onClick={() => toggleSort("name")}>
                          Empresa <ArrowUpDown className="inline ml-1 size-3" />
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/40" onClick={() => toggleSort("category")}>
                          Categoria <ArrowUpDown className="inline ml-1 size-3" />
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-muted/40" onClick={() => toggleSort("distance")}>
                          Distância <ArrowUpDown className="inline ml-1 size-3" />
                        </TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Cidade/CRM</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedResults.map((r) => {
                        const hasWeb = r.website != null && r.website.trim() !== "";
                        
                        // Default values for CRM fields since they are fetched inline
                        const wa = whatsappLink(r.phone);
                        const tel = telLink(r.phone);
                        const distanceDisplay = r.distanceKm != null 
                          ? r.distanceKm < 1 
                            ? `${Math.round(r.distanceKm * 1000)} m` 
                            : `${r.distanceKm.toFixed(1)} km`
                          : "—";

                        return (
                          <TableRow 
                            key={r.osm_id} 
                            className="cursor-pointer"
                            onClick={() => handleOpenCRMDetails(r.osm_id)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <StarButton osmId={r.osm_id} />
                            </TableCell>
                            <TableCell className="font-medium text-slate-200">
                              {r.name}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.category || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-slate-200 tabular-nums">
                              {distanceDisplay}
                            </TableCell>
                            <TableCell>
                              {hasWeb ? (
                                <a 
                                  href={r.website!} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Site <ExternalLink className="size-3" />
                                </a>
                              ) : (
                                <Badge className="border-transparent bg-rose-500/15 text-rose-300 text-[10px]">
                                  🔴 SEM WEBSITE
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()} className="py-2">
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-muted-foreground">{r.city || "—"}</span>
                                <CRMStatusSelector osmId={r.osm_id} />
                              </div>
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex gap-1">
                                {tel && (
                                  <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Ligar">
                                    <a href={tel}><Phone className="size-3.5" /></a>
                                  </Button>
                                )}
                                {wa && (
                                  <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="WhatsApp">
                                    <a href={wa} target="_blank" rel="noreferrer">
                                      <MessageCircle className="size-3.5 text-emerald-400" />
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* CRM Details Sheet Drawer */}
      <CompanyDrawer
        company={selectedCompany}
        onClose={() => setSelectedCompanyId(null)}
        onUpdate={(patch) => selectedCompany && updateCompanyMutation.mutate({ id: selectedCompany.id, patch })}
      />
    </AppShell>
  );
}

// Inline helper component to query/toggle star icon directly from OSM ID
function StarButton({ osmId }: { osmId: string }) {
  const qc = useQueryClient();
  const { data: record = null } = useQuery({
    queryKey: ["fav-osm", osmId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, favorite")
        .eq("osm_id", osmId)
        .maybeSingle();
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      if (!record) return;
      const { error } = await supabase
        .from("companies")
        .update({ favorite: !record.favorite })
        .eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fav-osm", osmId] });
      qc.invalidateQueries({ queryKey: ["company-detail", record?.id] });
    },
  });

  if (!record) return <Star className="size-4 text-slate-600" />;

  return (
    <button
      onClick={() => toggleMutation.mutate()}
      className="p-1"
      title={record.favorite ? "Desfavoritar" : "Favoritar"}
    >
      <Star
        className={`size-4 transition-transform active:scale-125 ${
          record.favorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
        }`}
      />
    </button>
  );
}

// Inline component to select CRM status directly in result table
function CRMStatusSelector({ osmId }: { osmId: string }) {
  const qc = useQueryClient();
  const { data: record = null } = useQuery({
    queryKey: ["status-osm", osmId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, status")
        .eq("osm_id", osmId)
        .maybeSingle();
      return data;
    },
  });

  const changeMutation = useMutation({
    mutationFn: async (status: Status) => {
      if (!record) return;
      const { error } = await supabase
        .from("companies")
        .update({ status })
        .eq("id", record.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["status-osm", osmId] });
      qc.invalidateQueries({ queryKey: ["company-detail", record?.id] });
    },
  });

  if (!record) return null;

  return (
    <Select
      value={record.status}
      onValueChange={(v) => changeMutation.mutate(v as Status)}
    >
      <SelectTrigger className="h-7 w-[120px] text-[10px] bg-slate-900/60 border-border/40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
          <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// CRM Edit Drawer
function CompanyDrawer({
  company,
  onClose,
  onUpdate,
}: {
  company: Company | null;
  onClose: () => void;
  onUpdate: (patch: Partial<Company>) => void;
}) {
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [lastContact, setLastContact] = useState("");
  const [nextContact, setNextContact] = useState("");

  useEffect(() => {
    if (company) {
      setNotes(company.notes ?? "");
      setNotesDirty(false);
      setLastContact(company.last_contact_at ? company.last_contact_at.split("T")[0] : "");
      setNextContact(company.next_contact_at ? company.next_contact_at.split("T")[0] : "");
    }
  }, [company?.id]);

  const wa = whatsappLink(company?.phone);
  const tel = telLink(company?.phone);

  const handleSaveNotes = () => {
    onUpdate({ notes });
    setNotesDirty(false);
    toast.success("Observações salvas");
  };

  const handleSaveDates = () => {
    onUpdate({
      last_contact_at: lastContact ? new Date(lastContact).toISOString() : null,
      next_contact_at: nextContact ? new Date(nextContact).toISOString() : null,
    });
    toast.success("Agendamento de contatos atualizado.");
  };

  return (
    <Sheet open={!!company} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-card text-card-foreground">
        {company && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-8 text-lg font-bold text-slate-100">{company.name}</SheetTitle>
            </SheetHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className={"border-transparent " + STATUS_TONES[company.status]}>
                {STATUS_LABELS[company.status]}
              </Badge>
              {(!company.website || company.website.trim() === "") && (
                <Badge className="border-transparent bg-rose-500/15 text-rose-300">🔴 Sem website</Badge>
              )}
            </div>

            <div className="mt-6 space-y-4 text-xs">
              <div className="flex items-start gap-3">
                <MapPin className="size-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="uppercase tracking-wide text-[10px] text-muted-foreground">Endereço</div>
                  <div className="text-slate-200 mt-0.5">{company.address || "—"}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="size-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="uppercase tracking-wide text-[10px] text-muted-foreground">Telefone</div>
                  <div className="text-slate-200 mt-0.5">{company.phone ? formatPhoneBR(company.phone) : "—"}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="size-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="uppercase tracking-wide text-[10px] text-muted-foreground">E-mail</div>
                  <div className="text-slate-200 mt-0.5">{company.email || "—"}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Globe className="size-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="uppercase tracking-wide text-[10px] text-muted-foreground">Website</div>
                  <div className="mt-0.5">
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noreferrer" className="text-primary hover:underline font-medium">
                        {company.website}
                      </a>
                    ) : "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {tel && (
                <Button asChild variant="outline" size="sm" className="text-xs">
                  <a href={tel}><Phone className="mr-2 size-3.5" /> Ligar</a>
                </Button>
              )}
              {wa && (
                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-xs text-white">
                  <a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="mr-2 size-3.5" /> WhatsApp</a>
                </Button>
              )}
              {company.website && (
                <Button asChild variant="outline" size="sm" className="text-xs">
                  <a href={company.website} target="_blank" rel="noreferrer"><Globe className="mr-2 size-3.5" /> Abrir Site</a>
                </Button>
              )}
            </div>

            <Separator className="my-6 border-border/40" />

            {/* CRM Management section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-100">Status & Agendamentos</h3>
              
              <div className="space-y-1">
                <Label>Status do Lead</Label>
                <Select value={company.status} onValueChange={(v) => onUpdate({ status: v as Status })}>
                  <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                      <SelectItem key={s} value={s} className="text-xs">{STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date pickers (last and next contact) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-3 text-primary" />
                    Último Contato
                  </Label>
                  <input
                    type="date"
                    value={lastContact}
                    onChange={(e) => setLastContact(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Calendar className="size-3 text-primary" />
                    Próximo Contato
                  </Label>
                  <input
                    type="date"
                    value={nextContact}
                    onChange={(e) => setNextContact(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button size="sm" variant="outline" className="text-xs" onClick={handleSaveDates}>
                  Salvar Datas
                </Button>
              </div>
            </div>

            <Separator className="my-6 border-border/40" />

            <div className="space-y-2">
              <Label className="font-semibold text-slate-100 text-sm">Observações</Label>
              <Textarea
                rows={5}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                placeholder="Ex.: Liguei hoje. Falei com o proprietário."
                className="text-xs text-slate-200"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!notesDirty}
                  onClick={handleSaveNotes}
                  className="text-xs"
                >
                  Salvar Observações
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}