import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS check
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Identificar usuário logado
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, authHeader);
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Extrair parâmetros do corpo da requisição
    const { provider, keyword, lat, lon, radiusKm, limit = 200 } = await req.json();

    if (!provider || !keyword || lat === undefined || lon === undefined || !radiusKm) {
      return new Response(JSON.stringify({ error: "Missing required search parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Obter chave de API do banco de dados de forma segura (se aplicável)
    let apiKey = "";
    if (provider !== "openstreetmap") {
      const { data: providerConfig } = await supabase
        .from("api_providers")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .maybeSingle();

      if (!providerConfig) {
        return new Response(JSON.stringify({ error: `Provider ${provider} is not configured` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: keyRecord } = await supabase
        .from("api_provider_keys")
        .select("api_key")
        .eq("provider_id", providerConfig.id)
        .maybeSingle();

      apiKey = keyRecord?.api_key ?? "";
      if (!apiKey) {
        return new Response(JSON.stringify({ error: `API Key for ${provider} is missing` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4. Executar a chamada para o Provedor Correspondente
    let results = [];

    if (provider === "openstreetmap") {
      // OSM / Overpass API Query
      const radiusMeters = radiusKm * 1000;

      const CATEGORY_PRESETS = [
        {
          value: "restaurant",
          label: "Restaurante",
          filters: [`["amenity"="restaurant"]`, `["amenity"="food_court"]`],
        },
        {
          value: "marmoraria",
          label: "Marmoraria",
          filters: [
            `["shop"="stonemason"]`,
            `["craft"="stone_cutter"]`,
            `["shop"="stone"]`,
            `["craft"="stonemason"]`,
          ],
        },
        {
          value: "dentist",
          label: "Dentista",
          filters: [`["amenity"="dentist"]`, `["healthcare"="dentist"]`],
        },
        {
          value: "advogado",
          label: "Advogado",
          filters: [`["office"="lawyer"]`, `["office"="lawyers"]`, `["office"="estate_agent"]`],
        },
        {
          value: "gym",
          label: "Academia",
          filters: [`["leisure"="fitness_centre"]`, `["sport"="fitness"]`, `["amenity"="gym"]`],
        },
        {
          value: "auto_escola",
          label: "Auto Escola",
          filters: [`["amenity"="driving_school"]`, `["driving_school"="yes"]`],
        },
        {
          value: "pharmacy",
          label: "Farmácia",
          filters: [`["amenity"="pharmacy"]`, `["healthcare"="pharmacy"]`],
        },
        { value: "bakery", label: "Padaria", filters: [`["shop"="bakery"]`] },
        {
          value: "clinic",
          label: "Clínica",
          filters: [
            `["amenity"="clinic"]`,
            `["amenity"="doctors"]`,
            `["healthcare"="clinic"]`,
            `["healthcare"="doctor"]`,
          ],
        },
        {
          value: "supermarket",
          label: "Mercado",
          filters: [`["shop"="supermarket"]`, `["shop"="convenience"]`],
        },
        {
          value: "hotel",
          label: "Hotel",
          filters: [`["tourism"="hotel"]`, `["tourism"="guest_house"]`, `["tourism"="hostel"]`],
        },
        { value: "car_repair", label: "Oficina", filters: [`["shop"="car_repair"]`] },
        { value: "barber", label: "Barbearia", filters: [`["shop"="hairdresser"]`] },
        {
          value: "beauty",
          label: "Salão de Beleza",
          filters: [`["shop"="beauty"]`, `["shop"="beauty_salon"]`],
        },
        { value: "pet", label: "Pet Shop", filters: [`["shop"="pet"]`, `["shop"="pet_grooming"]`] },
        {
          value: "builder",
          label: "Construtora",
          filters: [`["office"="builder"]`, `["office"="construction"]`, `["craft"="builder"]`],
        },
      ];

      const cleanKeyword = keyword.trim().toLowerCase();
      const preset = CATEGORY_PRESETS.find(
        (p) => p.value.toLowerCase() === cleanKeyword || p.label.toLowerCase() === cleanKeyword,
      );

      const filters = preset
        ? preset.filters
        : [
            `["amenity"~"${cleanKeyword}",i]`,
            `["shop"~"${cleanKeyword}",i]`,
            `["office"~"${cleanKeyword}",i]`,
            `["leisure"~"${cleanKeyword}",i]`,
            `["craft"~"${cleanKeyword}",i]`,
          ];

      const parts = filters
        .map(
          (f) =>
            `node${f}(around:${radiusMeters},${lat},${lon});way${f}(around:${radiusMeters},${lat},${lon});`,
        )
        .join("\n");
      const query = `[out:json][timeout:30];(\n${parts}\n);out center tags ${limit};`;

      const OVERPASS_SERVERS = [
        "https://overpass-api.de/api/interpreter",
        "https://lz4.overpass-api.de/api/interpreter",
        "https://z.overpass-api.de/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass.nchc.org.tw/api/interpreter",
      ];

      let lastError: Error | null = null;
      let osmData = null;

      // Embaralha a lista de servidores para distribuir a carga e evitar bloqueios por rate limit
      const shuffledServers = [...OVERPASS_SERVERS].sort(() => Math.random() - 0.5);

      for (const server of shuffledServers) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout per server

          const overpassRes = await fetch(server, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain",
              "User-Agent": "LeadFinder-Prospecting-App/1.0",
            },
            body: query,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (overpassRes.ok) {
            osmData = await overpassRes.json();
            break;
          } else {
            console.warn(`Overpass server ${server} failed with status: ${overpassRes.status}`);
            lastError = new Error(`Overpass status ${overpassRes.status} from ${server}`);
          }
        } catch (err) {
          console.warn(`Overpass server ${server} threw error:`, err);
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }

      if (!osmData) {
        throw lastError || new Error("Erro de comunicação com todos os servidores do Overpass API");
      }

      results = (osmData.elements || []).map((el: any) => {
        const tags = el.tags || {};
        return {
          company_name: tags.name || `Estabelecimento ${el.id}`,
          category: tags.amenity || tags.shop || tags.office || keyword,
          phone: tags.phone || tags["contact:phone"] || null,
          website: tags.website || tags["contact:website"] || null,
          email: tags.email || tags["contact:email"] || null,
          address: tags["addr:street"]
            ? `${tags["addr:street"]}, ${tags["addr:housenumber"] || ""}`
            : null,
          city: tags["addr:city"] || null,
          state: tags["addr:state"] || null,
          country: tags["addr:country"] || null,
          postal_code: tags["addr:postcode"] || null,
          latitude: el.lat || el.center?.lat || null,
          longitude: el.lon || el.center?.lon || null,
          rating: null,
          reviews: null,
          maps_url: tags.website || null,
          provider: "openstreetmap",
          provider_reference: el.id.toString(),
          status: "novo",
        };
      });
    } else if (provider === "google_places") {
      // Google Places Text Search
      const radiusMeters = radiusKm * 1000;
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radiusMeters}&keyword=${encodeURIComponent(keyword)}&key=${apiKey}`;
      const apiRes = await fetch(url);
      if (!apiRes.ok) throw new Error("Erro na requisição da API Google Places");
      const googleData = await apiRes.json();

      if (googleData.status === "REQUEST_DENIED") {
        throw new Error(googleData.error_message || "Chave de API do Google negada.");
      }

      results = (googleData.results || []).map((place: any) => ({
        company_name: place.name,
        category: place.types?.[0] || keyword,
        phone: null,
        website: null,
        email: null,
        address: place.vicinity || null,
        city: null,
        state: null,
        country: null,
        postal_code: null,
        latitude: place.geometry?.location?.lat || null,
        longitude: place.geometry?.location?.lng || null,
        rating: place.rating || null,
        reviews: place.user_ratings_total || null,
        maps_url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
        provider: "google_places",
        provider_reference: place.place_id,
        status: "novo",
      }));
    } else if (provider === "outscraper") {
      // Outscraper API
      const url = `https://api.outscraper.com/maps/search-v2?query=${encodeURIComponent(keyword)}&limit=${limit}&key=${apiKey}`;
      const apiRes = await fetch(url);
      if (!apiRes.ok) throw new Error("Erro na requisição da API Outscraper");
      const outData = await apiRes.json();
      const outResults = outData.data?.[0] || [];

      results = outResults.map((item: any) => ({
        company_name: item.name,
        category: item.subtypes?.[0] || keyword,
        phone: item.phone || null,
        website: item.site || null,
        email: item.email || null,
        address: item.address || null,
        city: item.city || null,
        state: item.state || null,
        country: item.country || null,
        postal_code: item.postal_code || null,
        latitude: item.latitude || null,
        longitude: item.longitude || null,
        rating: item.rating || null,
        reviews: item.reviews_id || null,
        maps_url: item.google_id ? `https://google.com/maps?cid=${item.google_id}` : null,
        provider: "outscraper",
        provider_reference: item.id || Math.random().toString(),
        status: "novo",
      }));
    } else if (provider === "serpapi") {
      // SerpAPI Google Maps
      const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(keyword)}&ll=@${lat},${lon},13z&api_key=${apiKey}`;
      const apiRes = await fetch(url);
      if (!apiRes.ok) throw new Error("Erro na requisição do SerpAPI");
      const serpData = await apiRes.json();
      const localResults = serpData.local_results || [];

      results = localResults.slice(0, limit).map((item: any) => ({
        company_name: item.title,
        category: item.type || keyword,
        phone: item.phone || null,
        website: item.website || null,
        email: null,
        address: item.address || null,
        city: null,
        state: null,
        country: null,
        postal_code: null,
        latitude: item.gps_coordinates?.latitude || null,
        longitude: item.gps_coordinates?.longitude || null,
        rating: item.rating || null,
        reviews: item.reviews || null,
        maps_url: item.place_id_search || null,
        provider: "serpapi",
        provider_reference: item.place_id || Math.random().toString(),
        status: "novo",
      }));
    } else if (provider === "apify") {
      // Apify Task execution
      const actorId = "apify/google-maps-scraper";
      const runUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`;

      const runRes = await fetch(runUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStrings: [keyword],
          maxCrawledPlacesPerSearch: limit,
          lat,
          lng: lon,
          zoom: 13,
        }),
      });

      if (!runRes.ok) throw new Error("Falha ao inicializar tarefa no Apify");
      const runData = await runRes.json();
      const datasetId = runData.data?.defaultDatasetId;

      if (!datasetId) throw new Error("Dataset do Apify não criado.");

      const dataUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}`;
      const dataRes = await fetch(dataUrl);
      if (!dataRes.ok) throw new Error("Falha ao puxar resultados do dataset do Apify");
      const items = await dataRes.json();

      results = items.slice(0, limit).map((item: any) => ({
        company_name: item.title || item.name,
        category: item.categoryName || keyword,
        phone: item.phone || null,
        website: item.website || null,
        email: item.email || null,
        address: item.address || null,
        city: item.city || null,
        state: item.state || null,
        country: item.country || null,
        postal_code: item.postalCode || null,
        latitude: item.location?.lat || null,
        longitude: item.location?.lng || null,
        rating: item.stars || null,
        reviews: item.reviewsCount || null,
        maps_url: item.url || null,
        provider: "apify",
        provider_reference: item.placeId || Math.random().toString(),
        status: "novo",
      }));
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
