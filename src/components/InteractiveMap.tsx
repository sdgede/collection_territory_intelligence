/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Customer, CollectorActivity } from "../types";
import { ZoomIn, ZoomOut, Compass } from "lucide-react";
import { haversineDistance } from "../engine";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Helper function to sort activities spatially using nearest-neighbor starting from a point
function sortSpatially(
  startLat: number,
  startLng: number,
  points: CollectorActivity[]
): CollectorActivity[] {
  const unvisited = [...points];
  const sorted: CollectorActivity[] = [];
  let currentLat = startLat;
  let currentLng = startLng;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversineDistance(
        currentLat,
        currentLng,
        unvisited[i].latitude,
        unvisited[i].longitude
      );
      if (dist < minDist) {
        minDist = dist;
        nearestIdx = i;
      }
    }
    const nextPt = unvisited.splice(nearestIdx, 1)[0];
    sorted.push(nextPt);
    currentLat = nextPt.latitude;
    currentLng = nextPt.longitude;
  }
  return sorted;
}

interface InteractiveMapProps {
  customer: Customer;
  activities: CollectorActivity[];
  selectedCollectorCode: string | null;
  onSelectCollector: (code: string | null) => void;
  collectorColorMap: Record<string, { border: string; fill: string; text: string; bg: string; rawBg: string; name: string }>;
}

export default function InteractiveMap({
  customer,
  activities,
  selectedCollectorCode,
  onSelectCollector,
  collectorColorMap,
}: InteractiveMapProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [collectorRoutes, setCollectorRoutes] = useState<Record<string, [number, number][]>>({});

  // Group activities to count them per collector
  const collectorsInDataset = useMemo(() => {
    return Array.from(new Set(activities.map((a) => a.collector_code)));
  }, [activities]);

  // Filter activities to ignore extreme anomalies (outside Indonesia bounds roughly)
  const mapActivities = useMemo(() => {
    return activities.filter(
      (act) =>
        Math.abs(act.latitude - customer.latitude) < 2.0 &&
        Math.abs(act.longitude - customer.longitude) < 2.0
    );
  }, [activities, customer.latitude, customer.longitude]);

  // Fetch road-following routes from public OSRM routing API (like Gojek / Google Maps)
  useEffect(() => {
    if (mapActivities.length === 0) {
      setCollectorRoutes({});
      return;
    }

    let isMounted = true;
    const collectors = Array.from(new Set(mapActivities.map((a) => a.collector_code)));
    const newRoutes: Record<string, [number, number][]> = {};

    const fetchRoutes = async () => {
      await Promise.all(
        (collectors as string[]).map(async (code) => {
          const rawActs = mapActivities.filter((a) => a.collector_code === code);
          if (rawActs.length === 0) return;

          // Sort spatially starting from customer location
          let sortedActs = sortSpatially(customer.latitude, customer.longitude, rawActs);

          // Limit activities used for routing to prevent long OSRM URLs and browser freezing
          if (sortedActs.length > 40) {
            sortedActs = sortedActs.slice(0, 40);
          }

          // Sequential routing starting from customer coordinates
          const coords = [
            [customer.longitude, customer.latitude],
            ...sortedActs.map((a) => [a.longitude, a.latitude]),
          ];

          // OSRM coordinates format: lng,lat;lng,lat
          const coordString = coords.map((c) => `${c[0]},${c[1]}`).join(";");
          const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;

          try {
            const res = await fetch(url);
            if (res.ok) {
              const data = await res.json();
              if (data.routes && data.routes.length > 0 && isMounted) {
                // OSRM returns coordinates in [lng, lat], convert to [lat, lng] for Leaflet
                const pathCoords: [number, number][] = data.routes[0].geometry.coordinates.map(
                  (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
                );
                newRoutes[code] = pathCoords;
              }
            }
          } catch (error) {
            console.warn(`[OSRM] Failed to fetch road route for collector ${code}:`, error);
          }
        })
      );

      if (isMounted) {
        setCollectorRoutes(newRoutes);
      }
    };

    fetchRoutes();

    return () => {
      isMounted = false;
    };
  }, [customer.customer_id, customer.latitude, customer.longitude, mapActivities]);

  // Map collector codes to robust, distinct theme colors (Tailwind & Hex style)
  const getCollectorColors = (code: string) => {
    return collectorColorMap[code] || {
      border: "#cbd5e1",
      fill: "#f1f5f9",
      text: "text-slate-650",
      bg: "bg-slate-500",
      rawBg: "#64748b",
      name: "Abu-abu"
    };
  };

  // Initialize Map Instance
  useEffect(() => {
    if (!mapDivRef.current) return;

    // Create map centered on customer location
    const map = L.map(mapDivRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([customer.latitude, customer.longitude], 14);

    // Use CartoDB Dark Matter tile layer for an extremely premium dark theme
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    mapInstanceRef.current = map;
    layersGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layersGroupRef.current = null;
      }
    };
  }, []);

  // Update Layers and Markers dynamically when props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layersGroup = layersGroupRef.current;
    if (!map || !layersGroup) return;

    // Clear previous layers
    layersGroup.clearLayers();

    // 1. Center Map View on Customer
    map.setView([customer.latitude, customer.longitude]);

    // 2. Core Radius (1 km) circle
    L.circle([customer.latitude, customer.longitude], {
      radius: 1000,
      color: "#10b981",
      weight: 1.5,
      dashArray: "4, 4",
      fillColor: "#10b981",
      fillOpacity: 0.04,
    })
      .bindTooltip("Cakupan Inti (1 km)", { permanent: false, direction: "top" })
      .addTo(layersGroup);

    // 3. Secondary Radius (3 km) circle
    L.circle([customer.latitude, customer.longitude], {
      radius: 3000,
      color: "#eab308",
      weight: 1.5,
      dashArray: "4, 4",
      fillColor: "#eab308",
      fillOpacity: 0.02,
    })
      .bindTooltip("Koridor Sekunder (3 km)", { permanent: false, direction: "top" })
      .addTo(layersGroup);

    // 4. Customer central marker - highly prominent vector map-pin with multiple glowing rings & NASABAH label tag
    const customerIcon = L.divIcon({
      className: "custom-customer-pin-wrapper",
      html: `
        <div class="relative flex flex-col items-center justify-center" style="width: 64px; height: 64px;">
          <!-- Glowing Pulsating Rings for low-zoom visibility -->
          <div class="absolute w-12 h-12 rounded-full bg-rose-500 opacity-20 animate-ping"></div>
          <div class="absolute w-6 h-6 rounded-full bg-rose-500 opacity-40 animate-ping" style="animation-delay: 0.5s;"></div>
          
          <!-- Marker Pin Icon (Map Pin shape) -->
          <div class="relative z-10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f43f5e" class="w-8 h-8 drop-shadow-[0_4px_6px_rgba(0,0,0,0.6)]" style="stroke: #ffffff; stroke-width: 1.5px;">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
          
          <!-- Label Tag -->
          <div class="absolute -bottom-1 bg-rose-600 border border-white text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-md uppercase tracking-wider scale-95 z-20">
            NASABAH
          </div>
        </div>
      `,
      iconSize: [64, 64],
      iconAnchor: [32, 45],
    });

    L.marker([customer.latitude, customer.longitude], { icon: customerIcon })
      .bindPopup(
        `<div class="p-2 text-slate-800 font-sans">
          <p class="font-bold text-xs text-red-600 uppercase tracking-wide">Nasabah</p>
          <p class="font-bold text-sm mt-0.5">${customer.customer_name}</p>
          <p class="text-xs text-slate-500 mt-1 leading-relaxed">${customer.address}</p>
          <p class="text-[9px] font-mono text-slate-400 mt-2.5">LAT: ${customer.latitude.toFixed(5)} | LNG: ${customer.longitude.toFixed(5)}</p>
         </div>`
      )
      .addTo(layersGroup);

    // 5. Draw chronological routing path (OSRM road-following route) for each collector
    collectorsInDataset.forEach((collectorCode) => {
      const isSelected = selectedCollectorCode === collectorCode;
      
      // Determine line styling based on active selection
      let opacity = 0.55;
      let weight = 3.0;
      
      if (selectedCollectorCode) {
        if (isSelected) {
          opacity = 0.95;
          weight = 4.0;
        } else {
          opacity = 0.08;
          weight = 1.5;
        }
      }

      const colors = getCollectorColors(collectorCode);
      const rawCollectorActs = mapActivities.filter((a) => a.collector_code === collectorCode);
      const collectorActs = sortSpatially(customer.latitude, customer.longitude, rawCollectorActs);

      if (collectorActs.length > 0) {
        let routeLatLngs: [number, number][] = [];

        // Check if we have OSRM road routing coordinates for this collector
        if (collectorRoutes[collectorCode] && collectorRoutes[collectorCode].length > 0) {
          routeLatLngs = collectorRoutes[collectorCode];
        } else {
          // Fallback to straight lines connecting customer -> activities
          routeLatLngs = [
            [customer.latitude, customer.longitude],
            ...collectorActs.map((act) => [act.latitude, act.longitude] as [number, number])
          ];
        }

        if (routeLatLngs.length > 1) {
          // Glow Route Line (Go-jek / Waze navigation layout style)
          L.polyline(routeLatLngs, {
            color: colors.border,
            weight: weight + 4,
            opacity: opacity * 0.35,
            lineJoin: "round",
          }).addTo(layersGroup);

          // Core Route Line
          L.polyline(routeLatLngs, {
            color: colors.border,
            weight: weight,
            opacity: opacity,
            lineJoin: "round",
          }).addTo(layersGroup);
        }
      }
    });

    // 7. Plot collector activity markers
    mapActivities.forEach((act) => {
      const isSelected = selectedCollectorCode === act.collector_code;
      const colors = getCollectorColors(act.collector_code);
      const opacity = !selectedCollectorCode || isSelected ? 1 : 0.25;

      // Find chronological sequence index for selected collector
      let sequenceIndex = -1;
      if (isSelected) {
        const rawCollectorActs = mapActivities.filter((a) => a.collector_code === act.collector_code);
        const collectorActs = sortSpatially(customer.latitude, customer.longitude, rawCollectorActs);
        sequenceIndex = collectorActs.findIndex(
          (a) =>
            a.latitude === act.latitude &&
            a.longitude === act.longitude &&
            a.activity_date === act.activity_date
        );
      }

      // Custom div HTML based on selected status
      let markerHtml = "";
      if (isSelected && sequenceIndex !== -1) {
        markerHtml = `
          <div class="relative flex items-center justify-center" style="width: 24px; height: 24px;">
            <div class="absolute w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-white transition-all duration-200" style="background-color: ${colors.border}; z-index: 10;">
              ${sequenceIndex + 1}
            </div>
            <div class="absolute w-7 h-7 rounded-full bg-white opacity-40 animate-ping"></div>
          </div>
        `;
      } else {
        markerHtml = `
          <div class="w-3.5 h-3.5 rounded-full border-2 border-white shadow-md transition-all duration-200" style="background-color: ${colors.fill}; border-color: ${colors.border}; opacity: ${opacity};"></div>
        `;
      }

      const activityIcon = L.divIcon({
        className: "custom-collector-pin-wrapper",
        html: markerHtml,
        iconSize: isSelected ? [24, 24] : [14, 14],
        iconAnchor: isSelected ? [12, 12] : [7, 7],
      });

      const dist = haversineDistance(act.latitude, act.longitude, customer.latitude, customer.longitude);

      L.marker([act.latitude, act.longitude], { icon: activityIcon })
        .addTo(layersGroup)
        .on("click", () => {
          onSelectCollector(selectedCollectorCode === act.collector_code ? null : act.collector_code);
        })
        .bindPopup(
          `<div class="p-2 text-slate-800 font-sans min-w-[160px]">
            <div class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" style="background-color: ${colors.border};"></span>
              <span class="font-bold text-xs uppercase text-slate-800">Kolektor ${act.collector_code}</span>
            </div>
            <p class="text-xs font-semibold text-slate-700 mt-2">${act.activity_description}</p>
            <div class="grid grid-cols-2 gap-2 mt-2.5 pt-2 border-t border-slate-100 text-[10px]">
              <div>
                <span class="text-slate-400 block font-medium">Tanggal</span>
                <span class="font-mono text-slate-700 font-semibold">${act.activity_date}</span>
              </div>
              <div>
                <span class="text-slate-400 block font-medium">Jarak</span>
                <span class="font-mono text-slate-700 font-semibold">${dist.toFixed(2)} km</span>
              </div>
            </div>
            <div class="mt-2 text-[10px]">
              <span class="text-slate-400 block font-medium">Nominal Tertagih</span>
              <span class="font-mono text-emerald-600 font-bold">Rp ${act.transaction_amount.toLocaleString("id-ID")}</span>
            </div>
           </div>`
        );
    });

    // 8. Auto-adjust map bounds to fit customer and all plotted activities (if any)
    if (mapActivities.length > 0) {
      const latlngs = mapActivities.map((act) => [act.latitude, act.longitude] as [number, number]);
      latlngs.push([customer.latitude, customer.longitude]);
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
    }
  }, [customer, mapActivities, selectedCollectorCode, collectorRoutes]);

  // Map Zoom Controls
  const handleZoom = (direction: "in" | "out") => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (direction === "in") {
      map.zoomIn();
    } else {
      map.zoomOut();
    }
  };

  const handleResetZoom = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const latlngs = mapActivities.map((act) => [act.latitude, act.longitude] as [number, number]);
    latlngs.push([customer.latitude, customer.longitude]);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden flex flex-col h-full" id="map-section-card">
      {/* Header Panel */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-2">
            <Compass className="w-4 h-4 text-slate-400" />
            Visualisasi Spasial Wilayah Operasional (Real Map)
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Menampilkan radius wilayah inti (1 km) dan sekunder (3 km) serta jejak aktivitas kolektor.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleZoom("in")}
            className="p-1.5 hover:bg-slate-100 text-slate-500 rounded transition-colors cursor-pointer"
            title="Perbesar Peta"
            id="btn-zoom-in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleZoom("out")}
            className="p-1.5 hover:bg-slate-100 text-slate-500 rounded transition-colors cursor-pointer"
            title="Perkecil Peta"
            id="btn-zoom-out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2 py-1 text-[10px] bg-white border border-slate-200 font-mono text-slate-500 hover:bg-slate-50 rounded shadow-xs cursor-pointer"
            title="Reset Zoom ke Rentang Optimal"
            id="btn-zoom-reset"
          >
            Reset Zoom
          </button>
        </div>
      </div>

      {/* Map Division */}
      <div className="relative flex-1 flex items-center justify-center min-h-[500px]">
        {/* Leaflet DOM Anchor */}
        <div ref={mapDivRef} className="w-full h-full min-h-[500px] z-0 bg-[#151a22]" />

        {/* Floating current map coordinate info */}
        <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-sm px-2.5 py-1.5 rounded-lg border border-slate-800 text-left font-mono text-[9px] text-slate-300 z-10">
          <div>LAT: {customer.latitude.toFixed(5)}</div>
          <div>LNG: {customer.longitude.toFixed(5)}</div>
        </div>
      </div>
    </div>
  );
}
