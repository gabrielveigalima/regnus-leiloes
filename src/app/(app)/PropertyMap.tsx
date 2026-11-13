"use client";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

interface Point { id: string; propertyId: string; lat: number; lng: number; title: string; minBid: number | null; discountPct: number | null; precision: string | null }
interface Resp { points: Point[]; withCoords: number; total: number }

const brl = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Mapa OSM com clusters. `query` = querystring dos filtros; `single` = ponto único (detalhe do imóvel). */
export function PropertyMap({ query, single, height = 520 }: { query?: string; single?: { lat: number; lng: number; title: string }; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<string>("Carregando mapa…");

  useEffect(() => {
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    (async () => {
      const L = (await import("leaflet")).default;
      (window as unknown as { L: typeof L }).L = L;
      await import("leaflet.markercluster");
      if (disposed || !el.current) return;
      map = L.map(el.current).setView([-14.2, -51.9], 4);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);

      if (single) {
        L.circleMarker([single.lat, single.lng], { radius: 9, color: "#24310f", fillColor: "#324415", fillOpacity: 0.9 }).addTo(map).bindPopup(esc(single.title));
        map.setView([single.lat, single.lng], 16);
        setInfo("");
        return;
      }
      const res = await fetch(`/api/busca/pontos?${query ?? ""}`);
      if (!res.ok) { setInfo("Não foi possível carregar o mapa."); return; }
      const data: Resp = await res.json();
      if (disposed) return;
      const cluster = (L as unknown as { markerClusterGroup: () => import("leaflet").FeatureGroup }).markerClusterGroup();
      for (const p of data.points) {
        const approx = p.precision === "STREET" || p.precision === "CITY";
        L.circleMarker([p.lat, p.lng], { radius: 7, color: "#24310f", weight: 1, fillColor: approx ? "#b8b6a3" : "#324415", fillOpacity: 0.9 })
          .bindPopup(`<strong>${esc(p.title)}</strong><br>${brl(p.minBid)}${p.discountPct ? ` (-${p.discountPct.toFixed(0)}%)` : ""}${approx ? `<br><em>localização aproximada (${p.precision === "CITY" ? "cidade" : "rua"})</em>` : ""}<br><a href="/imovel/${encodeURIComponent(p.propertyId)}" target="_blank" rel="noopener">Ver imóvel</a>`)
          .addTo(cluster);
      }
      cluster.addTo(map);
      if (data.points.length) map.fitBounds(cluster.getBounds(), { maxZoom: 14, padding: [20, 20] });
      const hidden = data.total - data.withCoords;
      setInfo(`${data.points.length.toLocaleString("pt-BR")} no mapa${data.withCoords > data.points.length ? ` (limite de ${data.points.length})` : ""}` +
        `${hidden > 0 ? ` · ${hidden.toLocaleString("pt-BR")} ainda sem localização` : ""}`);
    })().catch(() => setInfo("Não foi possível carregar o mapa."));
    return () => { disposed = true; map?.remove(); };
  }, [query, single]);

  return (
    <div>
      {info && <p className="muted">{info}</p>}
      <div ref={el} className="property-map" style={{ height, borderRadius: 8, border: "1px solid var(--line)" }} />
    </div>
  );
}
