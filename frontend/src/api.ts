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

export type PublicReview = {
  id: string;
  name: string;
  text: string;
  stars: number;
  at: string;
};

async function errorMessage(response: Response): Promise<string> {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.error === "string" ? payload.error : "The request failed.";
}

export async function listReviews(): Promise<PublicReview[]> {
  const response = await fetch(`${base}/api/reviews`);
  if (!response.ok) throw new Error(await errorMessage(response));
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload.reviews) ? payload.reviews : [];
}

export async function createReview(body: { name: string; text: string; stars: number }): Promise<PublicReview> {
  return postJson<PublicReview>("/api/reviews", body);
}

export async function updateReview(
  id: string,
  body: { name: string; text: string; stars: number },
  key: string,
): Promise<PublicReview> {
  const response = await fetch(`${base}/api/reviews/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Review-Key": key },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<PublicReview>;
}

export async function deleteReview(id: string, key: string): Promise<void> {
  const response = await fetch(`${base}/api/reviews/${id}`, {
    method: "DELETE",
    headers: { "X-Review-Key": key },
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function checkReviewKey(key: string): Promise<void> {
  const response = await fetch(`${base}/api/reviews/auth`, {
    method: "POST",
    headers: { "X-Review-Key": key },
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function sendFeedback(body: { name: string; text: string }): Promise<void> {
  await postJson("/api/feedback", body);
}

export function fetchHeatmap(loadWeightLb: number, routes: RoutePlan[]): Promise<HeatmapResponse> {
  return postJson<HeatmapResponse>("/api/heatmap", {
    load_weight_lb: loadWeightLb,
    routes: routes.map((route) => ({ geometry: route.geometry })),
  });
}
