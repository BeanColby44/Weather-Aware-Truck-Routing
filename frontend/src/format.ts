import type { Checkpoint, RiskLevel } from "./types";

export const RISK_COLOR: Record<RiskLevel, string> = {
  low: "#2faf74",
  moderate: "#e2b100",
  high: "#e67e22",
  severe: "#e24b4b",
  no_travel: "#8d3d86",
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  severe: "Severe",
  no_travel: "No Travel",
};

export const ROUTE_COLOR = ["#1d6fd6", "#0f9b6c", "#e07a1f"];

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function weatherPhrase(checkpoint: Checkpoint): string {
  const parts: string[] = [];
  if (checkpoint.snow_in_hr >= 0.5) {
    parts.push(checkpoint.snow_level === "severe" || checkpoint.snow_level === "no_travel" ? "Heavy snow" : checkpoint.snow_in_hr >= 1 ? "Snow" : "Light snow");
  }
  if (checkpoint.rain_in_hr >= 0.1) {
    parts.push(checkpoint.rain_in_hr > 1 || checkpoint.rain_level === "no_travel" ? "Heavy rain" : checkpoint.rain_in_hr >= 0.25 ? "Rain" : "Light rain");
  }
  if (!parts.length && checkpoint.wind_mph >= 25) parts.push("Windy");
  if (!parts.length) parts.push("Clear");
  return parts.join(", ");
}

export function providerLabel(provider: string): string {
  if (provider === "openrouteservice") return "Truck directions, OpenRouteService";
  return "Driving directions";
}
