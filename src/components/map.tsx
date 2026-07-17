import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

interface MapMarker {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category?: string | null;
  address?: string | null;
}

interface MapProps {
  center: [number, number];
  radiusKm: number;
  markers: MapMarker[];
  onMarkerClick?: (marker: MapMarker) => void;
}

export function Map({ center, radiusKm, markers, onMarkerClick }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const centerMarkerRef = useRef<any>(null);
  const leafletMarkersRef = useRef<globalThis.Map<string, any>>(new globalThis.Map());
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !mapContainerRef.current) return;

    let mapInstance: any;
    let LInstance: any;

    async function initMap() {
      const L = await import("leaflet");
      LInstance = L;

      // Initialize map if it doesn't exist
      if (!mapRef.current) {
        mapInstance = L.map(mapContainerRef.current!).setView(center, 13);
        
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(mapInstance);

        mapRef.current = mapInstance;
      } else {
        mapInstance = mapRef.current;
      }

      // 1. Center Marker (📍 Custom pulsing center marker)
      const centerSvg = `
        <div class="relative flex items-center justify-center">
          <div class="absolute h-8 w-8 animate-ping rounded-full bg-primary/30 opacity-75"></div>
          <div class="relative flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white border-2 border-white shadow-lg">
            <span class="size-1.5 rounded-full bg-white"></span>
          </div>
        </div>
      `;

      const centerIcon = L.divIcon({
        html: centerSvg,
        className: "custom-center-marker",
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      if (centerMarkerRef.current) {
        centerMarkerRef.current.setLatLng(center);
      } else {
        centerMarkerRef.current = L.marker(center, { icon: centerIcon }).addTo(mapInstance);
      }

      // 2. Search Radius Circle
      const radiusMeters = radiusKm * 1000;
      if (circleRef.current) {
        circleRef.current.setLatLng(center);
        circleRef.current.setRadius(radiusMeters);
      } else {
        circleRef.current = L.circle(center, {
          color: "oklch(var(--p))", // Use primary color from CSS variables
          fillColor: "oklch(var(--p))",
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: "4 4",
        }).addTo(mapInstance);
      }

      // Pan/Zoom map to cover the radius
      const bounds = circleRef.current.getBounds();
      mapInstance.fitBounds(bounds, { padding: [20, 20] });

      // 3. Update Result Markers
      // Remove old markers that aren't in the new list
      const newMarkerIds = new Set(markers.map((m) => m.id));
      leafletMarkersRef.current.forEach((leafletMarker, id) => {
        if (!newMarkerIds.has(id)) {
          mapInstance.removeLayer(leafletMarker);
          leafletMarkersRef.current.delete(id);
        }
      });

      // Add or update new markers
      markers.forEach((m) => {
        const markerLatLng = [m.latitude, m.longitude] as [number, number];

        // Custom marker SVG for business pins
        const businessSvg = `
          <div class="relative group flex items-center justify-center">
            <div class="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 hover:bg-violet-500 hover:scale-110 transition-all text-white border border-white shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building-2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h2"/><path d="M18 18h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
            </div>
          </div>
        `;

        const businessIcon = L.divIcon({
          html: businessSvg,
          className: "custom-business-marker",
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        if (leafletMarkersRef.current.has(m.id)) {
          leafletMarkersRef.current.get(m.id).setLatLng(markerLatLng);
        } else {
          const leafletMarker = L.marker(markerLatLng, { icon: businessIcon }).addTo(mapInstance);
          
          // Add custom popup or tooltip
          leafletMarker.bindTooltip(`
            <div class="p-1 font-sans text-xs">
              <strong>${m.name}</strong><br/>
              <span class="text-muted-foreground">${m.category || ""}</span>
            </div>
          `, { direction: "top", offset: [0, -10] });

          if (onMarkerClick) {
            leafletMarker.on("click", () => {
              onMarkerClick(m);
            });
          }

          leafletMarkersRef.current.set(m.id, leafletMarker);
        }
      });
    }

    initMap();

    return () => {
      // Clean up map when component unmounts
      if (mapRef.current && !mapContainerRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        circleRef.current = null;
        centerMarkerRef.current = null;
        leafletMarkersRef.current.clear();
      }
    };
  }, [isClient, center, radiusKm, markers]);

  if (!isClient) {
    return (
      <div className="w-full h-[400px] bg-slate-900/50 border border-border/40 rounded-xl flex items-center justify-center text-muted-foreground animate-pulse">
        Carregando mapa...
      </div>
    );
  }

  return (
    <div 
      ref={mapContainerRef} 
      className="w-full h-[400px] rounded-xl border border-border/60 shadow-lg relative z-0"
      style={{ minHeight: "400px" }}
    />
  );
}
