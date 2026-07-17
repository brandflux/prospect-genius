// Free OpenStreetMap-based search: Nominatim for geocoding + Overpass for POIs.

export type CategoryPreset = {
  value: string;
  label: string;
  // Overpass tag filter, e.g. `["amenity"="restaurant"]`
  filters: string[];
};

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { value: "restaurant", label: "Restaurante", filters: [`["amenity"="restaurant"]`] },
  { value: "marmoraria", label: "Marmoraria", filters: [`["shop"="stonemason"]`, `["craft"="stone_cutter"]`, `["shop"="stone"]`] },
  { value: "dentist", label: "Dentista", filters: [`["amenity"="dentist"]`] },
  { value: "advogado", label: "Advogado", filters: [`["office"="lawyer"]`, `["office"="lawyers"]`, `["office"="estate_agent"]`] },
  { value: "gym", label: "Academia", filters: [`["leisure"="fitness_centre"]`, `["sport"="fitness"]`] },
  { value: "auto_escola", label: "Auto Escola", filters: [`["amenity"="driving_school"]`, `["driving_school"="yes"]`] },
  { value: "pharmacy", label: "Farmácia", filters: [`["amenity"="pharmacy"]`] },
  { value: "bakery", label: "Padaria", filters: [`["shop"="bakery"]`] },
  { value: "clinic", label: "Clínica", filters: [`["amenity"="clinic"]`, `["amenity"="doctors"]`] },
  { value: "supermarket", label: "Mercado", filters: [`["shop"="supermarket"]`, `["shop"="convenience"]`] },
  { value: "hotel", label: "Hotel", filters: [`["tourism"="hotel"]`, `["tourism"="guest_house"]`, `["tourism"="hostel"]`] },
  { value: "car_repair", label: "Oficina", filters: [`["shop"="car_repair"]`] },
  { value: "barber", label: "Barbearia", filters: [`["shop"="hairdresser"]`] },
  { value: "beauty", label: "Salão de Beleza", filters: [`["shop"="beauty"]`, `["shop"="beauty_salon"]`] },
  { value: "pet", label: "Pet Shop", filters: [`["shop"="pet"]`, `["shop"="pet_grooming"]`] },
  { value: "builder", label: "Construtora", filters: [`["office"="builder"]`, `["office"="construction"]`, `["craft"="builder"]`] },
];

export type OsmPoi = {
  osm_id: string;
  name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string];
};

export async function geocodeCity(params: {
  city: string;
  state?: string;
  country?: string;
}): Promise<NominatimResult | null> {
  const q = [params.city, params.state, params.country].filter(Boolean).join(", ");
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "LeadFinder-Prospecting-App/1.0" },
  });
  if (!res.ok) throw new Error(`Nominatim: ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data[0] ?? null;
}

export async function geocodeAddress(addressStr: string): Promise<NominatimResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", addressStr);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "LeadFinder-Prospecting-App/1.0" },
  });
  if (!res.ok) throw new Error(`Nominatim: ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data[0] ?? null;
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

function pickCategory(tags: Record<string, string>): string | null {
  return (
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.craft ||
    tags.office ||
    null
  );
}

function buildAddress(tags: Record<string, string>): string | null {
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(", ");
  const parts = [street, tags["addr:suburb"] || tags["addr:neighbourhood"]].filter(Boolean);
  return parts.length ? parts.join(" - ") : null;
}

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function overpassSearchAround(opts: {
  lat: number;
  lon: number;
  radiusMeters: number;
  filters: string[];
  limit?: number;
}): Promise<OsmPoi[]> {
  const parts = opts.filters
    .map(
      (f) =>
        `node${f}(around:${opts.radiusMeters},${opts.lat},${opts.lon});way${f}(around:${opts.radiusMeters},${opts.lat},${opts.lon});relation${f}(around:${opts.radiusMeters},${opts.lat},${opts.lon});`,
    )
    .join("\n");
  const query = `[out:json][timeout:30];(\n${parts}\n);out center tags ${opts.limit ?? 200};`;

  let lastError: any = null;
  for (const server of OVERPASS_SERVERS) {
    try {
      const res = await fetchWithTimeout(server, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query,
      }, 15000); // 15 seconds timeout per server

      if (res.ok) {
        const json = (await res.json()) as OverpassResponse;
        const pois: OsmPoi[] = [];
        for (const el of json.elements) {
          const tags = el.tags ?? {};
          if (!tags.name) continue;
          const lat = el.lat ?? el.center?.lat ?? null;
          const lon = el.lon ?? el.center?.lon ?? null;
          pois.push({
            osm_id: `${el.type[0]}${el.id}`,
            name: tags.name,
            category: pickCategory(tags),
            phone: tags.phone || tags["contact:phone"] || tags["contact:mobile"] || null,
            email: tags.email || tags["contact:email"] || null,
            website: tags.website || tags["contact:website"] || tags.url || null,
            address: buildAddress(tags),
            city: tags["addr:city"] || null,
            state: tags["addr:state"] || null,
            country: tags["addr:country"] || null,
            latitude: lat,
            longitude: lon,
          });
        }
        return pois;
      } else {
        console.warn(`Overpass server ${server} failed with status: ${res.status}`);
        lastError = new Error(`Overpass status ${res.status} from ${server}`);
      }
    } catch (err) {
      console.warn(`Overpass server ${server} threw error:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error("All Overpass servers failed or timed out.");
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}