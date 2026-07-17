// Free OpenStreetMap-based search: Nominatim for geocoding + Overpass for POIs.

export type CategoryPreset = {
  value: string;
  label: string;
  // Overpass tag filter, e.g. `["amenity"="restaurant"]`
  filters: string[];
};

export const CATEGORY_PRESETS: CategoryPreset[] = [
  { value: "restaurant", label: "Restaurante", filters: [`["amenity"="restaurant"]`] },
  { value: "cafe", label: "Café", filters: [`["amenity"="cafe"]`] },
  { value: "bakery", label: "Padaria", filters: [`["shop"="bakery"]`] },
  { value: "bar", label: "Bar / Pub", filters: [`["amenity"="bar"]`, `["amenity"="pub"]`] },
  { value: "fast_food", label: "Fast food", filters: [`["amenity"="fast_food"]`] },
  { value: "gym", label: "Academia", filters: [`["leisure"="fitness_centre"]`, `["sport"="fitness"]`] },
  { value: "dentist", label: "Dentista", filters: [`["amenity"="dentist"]`] },
  { value: "doctor", label: "Médico / Clínica", filters: [`["amenity"="doctors"]`, `["amenity"="clinic"]`] },
  { value: "pharmacy", label: "Farmácia", filters: [`["amenity"="pharmacy"]`] },
  { value: "vet", label: "Veterinário", filters: [`["amenity"="veterinary"]`] },
  { value: "hairdresser", label: "Barbearia / Cabeleireiro", filters: [`["shop"="hairdresser"]`] },
  { value: "beauty", label: "Salão de beleza", filters: [`["shop"="beauty"]`] },
  { value: "hotel", label: "Hotel / Pousada", filters: [`["tourism"="hotel"]`, `["tourism"="guest_house"]`] },
  { value: "supermarket", label: "Supermercado", filters: [`["shop"="supermarket"]`] },
  { value: "clothes", label: "Loja de roupas", filters: [`["shop"="clothes"]`] },
  { value: "car_repair", label: "Oficina mecânica", filters: [`["shop"="car_repair"]`] },
  { value: "florist", label: "Floricultura", filters: [`["shop"="florist"]`] },
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
};

type NominatimResult = {
  boundingbox: [string, string, string, string]; // [south, north, west, east]
  lat: string;
  lon: string;
  display_name: string;
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
  url.searchParams.set("addressdetails", "0");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
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

export async function overpassSearch(opts: {
  bbox: [number, number, number, number]; // [south, west, north, east]
  filters: string[];
  limit?: number;
}): Promise<OsmPoi[]> {
  const [s, w, n, e] = opts.bbox;
  const parts = opts.filters
    .map(
      (f) =>
        `node${f}(${s},${w},${n},${e});way${f}(${s},${w},${n},${e});relation${f}(${s},${w},${n},${e});`,
    )
    .join("\n");
  const query = `[out:json][timeout:25];(\n${parts}\n);out center tags ${opts.limit ?? 200};`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query,
  });
  if (!res.ok) throw new Error(`Overpass: ${res.status}`);
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
}

export function bboxFromNominatim(r: NominatimResult): [number, number, number, number] {
  const [s, n, w, e] = r.boundingbox.map(Number) as [number, number, number, number];
  return [s, w, n, e];
}