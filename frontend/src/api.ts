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

export function planTrip(body: PlanRequest): Promise<PlanResponse> {
  return postJson<PlanResponse>("/api/plan", body);
}

export function fetchHeatmap(loadWeightLb: number, routes: RoutePlan[]): Promise<HeatmapResponse> {
  return postJson<HeatmapResponse>("/api/heatmap", {
    load_weight_lb: loadWeightLb,
    routes: routes.map((route) => ({ geometry: route.geometry })),
  });
}
