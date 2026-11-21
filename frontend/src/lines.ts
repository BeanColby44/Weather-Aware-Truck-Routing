import type { RiskLevel, RoutePlan } from "./types";

const EARTH_MILES = 3958.7613;

function milesBetween(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.sqrt(Math.min(1, a)));
}

function levelAtMile(route: RoutePlan, mile: number): RiskLevel {
  const segments = route.segments;
  if (!segments.length) return "low";
  for (const segment of segments) {
    if (mile <= segment.to_mile + 0.01) return segment.level;
  }
  return segments[segments.length - 1].level;
}

export function riskPolylines(route: RoutePlan): { level: RiskLevel; positions: [number, number][] }[] {
  const coords = route.geometry.coordinates;
  if (coords.length < 2) return [];
  const totals = [0];
  for (let index = 1; index < coords.length; index += 1) {
    const previous = coords[index - 1];
    const current = coords[index];
    totals.push(totals[index - 1] + milesBetween(previous[0], previous[1], current[0], current[1]));
  }

  const groups: { level: RiskLevel; positions: [number, number][] }[] = [];
  for (let index = 1; index < coords.length; index += 1) {
    const level = levelAtMile(route, (totals[index] + totals[index - 1]) / 2);
    const end: [number, number] = [coords[index][1], coords[index][0]];
    const last = groups[groups.length - 1];
    if (last && last.level === level) {
      last.positions.push(end);
    } else {
      const start: [number, number] = [coords[index - 1][1], coords[index - 1][0]];
      groups.push({ level, positions: [start, end] });
    }
  }
  return groups;
}

export function routePositions(route: RoutePlan): [number, number][] {
  return route.geometry.coordinates.map((pair) => [pair[1], pair[0]]);
}

export type RoutePoint = { lat: number; lon: number; mile: number; bearing: number };

function track(route: RoutePlan): { coords: number[][]; totals: number[] } {
  const coords = route.geometry.coordinates;
  const totals = [0];
  for (let index = 1; index < coords.length; index += 1) {
    const previous = coords[index - 1];
    const current = coords[index];
    totals.push(totals[index - 1] + milesBetween(previous[0], previous[1], current[0], current[1]));
  }
  return { coords, totals };
}

function bearingDeg(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function geometryMiles(route: RoutePlan): number {
  const { totals } = track(route);
  return totals[totals.length - 1] ?? 0;
}

export function pointAtMile(route: RoutePlan, mile: number): RoutePoint {
  const { coords, totals } = track(route);
  if (!coords.length) return { lat: 0, lon: 0, mile: 0, bearing: 0 };
  const length = totals[totals.length - 1] ?? 0;
  const target = Math.min(Math.max(mile, 0), length);
  let index = 1;
  while (index < totals.length - 1 && totals[index] < target) index += 1;
  if (index >= coords.length) index = coords.length - 1;
  const span = totals[index] - totals[index - 1];
  const fraction = span === 0 ? 0 : (target - totals[index - 1]) / span;
  const lon = coords[index - 1][0] + fraction * (coords[index][0] - coords[index - 1][0]);
  const lat = coords[index - 1][1] + fraction * (coords[index][1] - coords[index - 1][1]);
  return {
    lat,
    lon,
    mile: target,
    bearing: bearingDeg(coords[index - 1][0], coords[index - 1][1], coords[index][0], coords[index][1]),
  };
}

export function mileAtLatLng(route: RoutePlan, lat: number, lon: number): number {
  const { coords, totals } = track(route);
  let best = Infinity;
  let mile = 0;
  for (let index = 1; index < coords.length; index += 1) {
    const start = coords[index - 1];
    const end = coords[index];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((lon - start[0]) * dx + (lat - start[1]) * dy) / len2));
    const distance = milesBetween(start[0] + t * dx, start[1] + t * dy, lon, lat);
    if (distance < best) {
      best = distance;
      mile = totals[index - 1] + t * (totals[index] - totals[index - 1]);
    }
  }
  return mile;
}
