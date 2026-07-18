import { overpassSearchAround, calculateDistance } from "@/lib/overpass";

// Padrão unificado de retorno do LeadFinder
export interface StandardizedCompany {
  company_name: string;
  category: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviews: number | null;
  maps_url: string | null;
  provider: string;
  provider_reference: string;
  status: string;
}

export interface ISearchProvider {
  searchBusinesses(params: {
    keyword: string;
    lat: number;
    lon: number;
    radiusKm: number;
    limit: number;
    apiKey?: string;
  }): Promise<StandardizedCompany[]>;
}

// 1. OpenStreetMap & Overpass
export class OpenStreetMapProvider implements ISearchProvider {
  async searchBusinesses(params: {
    keyword: string;
    lat: number;
    lon: number;
    radiusKm: number;
    limit: number;
  }): Promise<StandardizedCompany[]> {
    // Buscar categorias usando o motor Overpass existente
    const radiusMeters = params.radiusKm * 1000;
    
    // Filtro padrão fallback se não achar preset
    const filters = [
      `["amenity"~"${params.keyword.trim().toLowerCase()}",i]`,
      `["shop"~"${params.keyword.trim().toLowerCase()}",i]`,
      `["office"~"${params.keyword.trim().toLowerCase()}",i]`,
      `["leisure"~"${params.keyword.trim().toLowerCase()}",i]`,
      `["craft"~"${params.keyword.trim().toLowerCase()}",i]`
    ];

    const pois = await overpassSearchAround({
      lat: params.lat,
      lon: params.lon,
      radiusMeters,
      filters,
      limit: params.limit,
    });

    return pois.map((p) => {
      // Calcular distância
      let dist = 0;
      if (p.latitude != null && p.longitude != null) {
        dist = calculateDistance(params.lat, params.lon, p.latitude, p.longitude);
      }

      return {
        company_name: p.name,
        category: p.category || params.keyword,
        phone: p.phone,
        website: p.website,
        email: p.email,
        address: p.address,
        city: p.city,
        state: p.state,
        country: p.country,
        postal_code: null,
        latitude: p.latitude,
        longitude: p.longitude,
        rating: null,
        reviews: null,
        maps_url: p.website,
        provider: "openstreetmap",
        provider_reference: p.osm_id,
        status: "novo",
      };
    });
  }
}

// 2. Google Places API
export class GooglePlacesProvider implements ISearchProvider {
  async searchBusinesses(params: {
    keyword: string;
    lat: number;
    lon: number;
    radiusKm: number;
    limit: number;
    apiKey?: string;
  }): Promise<StandardizedCompany[]> {
    if (!params.apiKey) throw new Error("Google Places API Key is missing.");
    
    const radiusMeters = params.radiusKm * 1000;
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${params.lat},${params.lon}&radius=${radiusMeters}&keyword=${encodeURIComponent(params.keyword)}&key=${params.apiKey}`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Places: ${res.statusText}`);
    const data = await res.json();
    
    if (data.status === "REQUEST_DENIED") {
      throw new Error(data.error_message || "Chave de API do Google rejeitada.");
    }

    const results = data.results || [];
    return results.slice(0, params.limit).map((place: any) => ({
      company_name: place.name,
      category: place.types?.[0] || params.keyword,
      phone: place.formatted_phone_number || null, // Nearby search doesn't return formatting details without Place Details call, fallback mock format
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
  }
}

// 3. Outscraper
export class OutscraperProvider implements ISearchProvider {
  async searchBusinesses(params: {
    keyword: string;
    lat: number;
    lon: number;
    radiusKm: number;
    limit: number;
    apiKey?: string;
  }): Promise<StandardizedCompany[]> {
    if (!params.apiKey) throw new Error("Outscraper API Key is missing.");
    
    // Outscraper API endpoint para busca de locais no maps
    const url = `https://api.outscraper.com/maps/search-v2?query=${encodeURIComponent(params.keyword)}&limit=${params.limit}&key=${params.apiKey}`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Outscraper: ${res.statusText}`);
    const data = await res.json();

    const results = data.data?.[0] || [];
    return results.map((item: any) => ({
      company_name: item.name,
      category: item.subtypes?.[0] || params.keyword,
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
      provider_reference: item.query || item.id || Math.random().toString(),
      status: "novo",
    }));
  }
}

// 4. SerpAPI (Google Maps Engine)
export class SerpApiProvider implements ISearchProvider {
  async searchBusinesses(params: {
    keyword: string;
    lat: number;
    lon: number;
    radiusKm: number;
    limit: number;
    apiKey?: string;
  }): Promise<StandardizedCompany[]> {
    if (!params.apiKey) throw new Error("SerpAPI Key is missing.");

    // SerpAPI Google Maps search engine
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(params.keyword)}&ll=@${params.lat},${params.lon},13z&api_key=${params.apiKey}`;
    
    const res = await fetch(url);
    if (!res.ok) throw new Error(`SerpAPI: ${res.statusText}`);
    const data = await res.json();

    const localResults = data.local_results || [];
    return localResults.slice(0, params.limit).map((item: any) => ({
      company_name: item.title,
      category: item.type || params.keyword,
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
  }
}

// 5. Apify (Google Maps Scraper Actor)
export class ApifyProvider implements ISearchProvider {
  async searchBusinesses(params: {
    keyword: string;
    lat: number;
    lon: number;
    radiusKm: number;
    limit: number;
    apiKey?: string;
  }): Promise<StandardizedCompany[]> {
    if (!params.apiKey) throw new Error("Apify Token is missing.");

    // Executa e busca dados do Apify Google Maps Scraper Actor
    const actorId = "apify/google-maps-scraper";
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${params.apiKey}`;
    
    const runRes = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchStrings: [params.keyword],
        maxCrawledPlacesPerSearch: params.limit,
        lat: params.lat,
        lng: params.lon,
        zoom: 13,
      }),
    });

    if (!runRes.ok) throw new Error(`Apify Act Run: ${runRes.statusText}`);
    const runData = await runRes.json();
    const datasetId = runData.data?.defaultDatasetId;

    if (!datasetId) throw new Error("Falha ao inicializar tarefa do Apify.");

    // Aguardar conclusão ou puxar os dados do Dataset
    // Para simplificar a conexão instantânea, puxamos o Dataset gerado da execução
    const dataUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${params.apiKey}`;
    const dataRes = await fetch(dataUrl);
    if (!dataRes.ok) throw new Error(`Apify Dataset: ${dataRes.statusText}`);
    const items = await dataRes.json();

    return items.slice(0, params.limit).map((item: any) => ({
      company_name: item.title || item.name,
      category: item.categoryName || params.keyword,
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
}
