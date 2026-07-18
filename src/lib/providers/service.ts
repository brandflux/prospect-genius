import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { 
  StandardizedCompany, 
  OpenStreetMapProvider, 
  GooglePlacesProvider, 
  OutscraperProvider, 
  SerpApiProvider, 
  ApifyProvider 
} from "./types";

// Server-side logic to search businesses securely using keys on the server
export const searchBusinessesServer = createServerFn({ method: "POST" })
  .validator((d: { 
    provider: string; 
    keyword: string; 
    lat: number; 
    lon: number; 
    radiusKm: number; 
    limit: number; 
    userId: string;
  }) => d)
  .handler(async ({ data }) => {
    if (data.provider === "openstreetmap") {
      const osm = new OpenStreetMapProvider();
      return osm.searchBusinesses(data);
    }

    // Initialize secure server supabase client to select the key bypassing client RLS select block
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { createClient } = await import("@supabase/supabase-js");
    const serverSupabase = createClient(process.env.SUPABASE_URL || "", serviceRoleKey || "");

    const { data: provConfig } = await serverSupabase
      .from("api_providers")
      .select("id")
      .eq("user_id", data.userId)
      .eq("provider", data.provider)
      .maybeSingle();

    if (!provConfig) throw new Error("Provedor não configurado no banco de dados.");

    const { data: keyRecord } = await serverSupabase
      .from("api_provider_keys")
      .select("api_key")
      .eq("provider_id", provConfig.id)
      .maybeSingle();

    const apiKey = keyRecord?.api_key || "";
    if (!apiKey) throw new Error("Chave API não configurada para este provedor.");

    let runner;
    switch (data.provider) {
      case "google_places":
        runner = new GooglePlacesProvider();
        break;
      case "outscraper":
        runner = new OutscraperProvider();
        break;
      case "serpapi":
        runner = new SerpApiProvider();
        break;
      case "apify":
        runner = new ApifyProvider();
        break;
      default:
        throw new Error(`Provedor ${data.provider} desconhecido.`);
    }

    return runner.searchBusinesses({ ...data, apiKey });
  });

// Server-side logic to test API key connections securely
export const testConnectionServer = createServerFn({ method: "POST" })
  .validator((d: { provider: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { createClient } = await import("@supabase/supabase-js");
    const serverSupabase = createClient(process.env.SUPABASE_URL || "", serviceRoleKey || "");

    const { data: provConfig } = await serverSupabase
      .from("api_providers")
      .select("id")
      .eq("user_id", data.userId)
      .eq("provider", data.provider)
      .maybeSingle();

    if (!provConfig) return { success: false, message: "No API Key configured." };

    const { data: keyRecord } = await serverSupabase
      .from("api_provider_keys")
      .select("api_key")
      .eq("provider_id", provConfig.id)
      .maybeSingle();

    const apiKey = keyRecord?.api_key || "";
    if (!apiKey) return { success: false, message: "No API Key configured." };

    try {
      if (data.provider === "google_places") {
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=-23.55,-46.63&radius=500&key=${apiKey}`;
        const res = await fetch(url);
        const dataRes = await res.json();
        if (dataRes.status === "REQUEST_DENIED") return { success: false, message: "Invalid API Key" };
        return { success: true, message: "Connection Successful" };
      }
      
      if (data.provider === "outscraper") {
        const url = `https://api.outscraper.com/maps/search-v2?query=dentist&limit=1&key=${apiKey}`;
        const res = await fetch(url);
        if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid API Key" };
        return { success: true, message: "Connection Successful" };
      }

      if (data.provider === "serpapi") {
        const url = `https://serpapi.com/search.json?engine=google_maps&q=dentist&api_key=${apiKey}`;
        const res = await fetch(url);
        if (res.status === 401 || res.status === 403) return { success: false, message: "Invalid API Key" };
        return { success: true, message: "Connection Successful" };
      }

      if (data.provider === "apify") {
        const url = `https://api.apify.com/v2/users/me?token=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) return { success: false, message: "Invalid API Key" };
        return { success: true, message: "Connection Successful" };
      }

      return { success: true, message: "Connection Successful" };
    } catch (e) {
      return { success: false, message: "Authentication Failed" };
    }
  });

// Client-side Service Gateway
export const SearchProviderService = {
  async getActiveProvider(): Promise<{ id: string; provider: string; has_key: boolean; display_name: string } | null> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;

    const { data } = await supabase
      .from("api_providers")
      .select("id, provider, has_key_configured, display_name")
      .eq("user_id", userData.user.id)
      .eq("active", true)
      .maybeSingle();

    if (!data) {
      // Default OpenStreetMap active provider if none is active in DB
      return {
        id: "",
        provider: "openstreetmap",
        has_key: false,
        display_name: "OpenStreetMap",
      };
    }

    return {
      id: data.id,
      provider: data.provider,
      has_key: data.has_key_configured,
      display_name: data.display_name,
    };
  },

  async search(params: {
    keyword: string;
    lat: number;
    lon: number;
    radiusKm: number;
    limit: number;
  }): Promise<StandardizedCompany[]> {
    const active = await this.getActiveProvider();
    if (!active) throw new Error("Nenhum provedor de busca ativo configurado.");

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Usuário não autenticado.");

    try {
      // 1. Tentar invocar via Supabase Edge Function (Produção)
      const { data, error } = await supabase.functions.invoke("search-provider", {
        body: {
          provider: active.provider,
          keyword: params.keyword,
          lat: params.lat,
          lon: params.lon,
          radiusKm: params.radiusKm,
          limit: params.limit,
        },
      });

      if (error) throw error;
      return data as StandardizedCompany[];
    } catch (err) {
      console.warn("Chamada Edge Function falhou ou indisponível. Executando fallback seguro no servidor...", err);
      
      // 2. Fallback: Executar no servidor via Server Function (Desenvolvimento local robusto)
      return searchBusinessesServer({
        data: {
          provider: active.provider,
          keyword: params.keyword,
          lat: params.lat,
          lon: params.lon,
          radiusKm: params.radiusKm,
          limit: params.limit,
          userId: userData.user.id,
        }
      });
    }
  },

  async testConnection(provider: string): Promise<{ success: boolean; message: string }> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { success: false, message: "Usuário não autenticado" };

    try {
      // 1. Tentar invocar a Edge Function de teste (ou simular)
      const { data, error } = await supabase.functions.invoke("test-provider-connection", {
        body: { provider },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      // 2. Fallback local para testes ininterruptos
      return testConnectionServer({ data: { provider, userId: userData.user.id } });
    }
  }
};
