import type { PlanResponse } from "./types";

const KEY = "saved-routes";

export type SavedTrip = {
  id: string;
  savedAt: string;
  origin: string;
  destination: string;
  departureLocal: string;
  load: string;
  sample: number;
  selectedId: string | null;
  plan: PlanResponse;
};

export function readSaved(): SavedTrip[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedTrip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSaved(trips: SavedTrip[]) {
  localStorage.setItem(KEY, JSON.stringify(trips));
}

export function tripKey(trip: Pick<SavedTrip, "origin" | "destination" | "departureLocal" | "load" | "sample">) {
  return [trip.origin, trip.destination, trip.departureLocal, trip.load, trip.sample].join("|");
}
