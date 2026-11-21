import type { HeatmapResponse, PlanRequest, PlanResponse, RoutePlan } from "./types";

const base = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "The request failed.";
    throw new Error(message);
  }
  return payload as T;
}

export async function suggestPlaces(query: string, signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(`${base}/api/places?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  const suggestions = payload.suggestions;
  if (!Array.isArray(suggestions)) return [];
  return suggestions.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function planTrip(body: PlanRequest): Promise<PlanResponse> {
  return postJson<PlanResponse>("/api/plan", body);
}

export function fetchHeatmap(loadWeightLb: number, routes: RoutePlan[]): Promise<HeatmapResponse> {
  return postJson<HeatmapResponse>("/api/heatmap", {
    load_weight_lb: loadWeightLb,
    routes: routes.map((route) => ({ geometry: route.geometry })),
  });
}
