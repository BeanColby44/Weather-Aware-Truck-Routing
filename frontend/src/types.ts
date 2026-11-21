export type RiskLevel = "low" | "moderate" | "high" | "severe" | "no_travel";

export type Place = {
  query: string;
  label: string;
  lat: number;
  lon: number;
};

export type Checkpoint = {
  mile: number;
  lat: number;
  lon: number;
  eta: string;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  level: RiskLevel;
  wind_level: RiskLevel;
  rain_level: RiskLevel;
  snow_level: RiskLevel;
  load_rule_applied: boolean;
  reason: string;
  forecast_outside_window?: boolean;
};

export type Segment = {
  from_mile: number;
  to_mile: number;
  miles: number;
  level: RiskLevel;
};

export type RiskSummary = {
  low_miles: number;
  moderate_miles: number;
  high_miles: number;
  severe_miles: number;
  no_travel_miles: number;
  average_risk: number;
  average_label: string;
};

export type RoutePlan = {
  id: string;
  label: string;
  recommended: boolean;
  distance_miles: number;
  duration_seconds: number;
  duration_label: string;
  geometry: { type: "LineString"; coordinates: number[][] };
  risk_summary: RiskSummary;
  segments: Segment[];
  checkpoints: Checkpoint[];
};

export type PlanResponse = {
  origin: Place;
  destination: Place;
  departure: string;
  load_weight_lb: number;
  sample_miles: number;
  routing_provider: string;
  routing_note: string | null;
  forecast_note: string | null;
  recommended_route_id: string;
  recommendation: string;
  criteria: string[];
  routes: RoutePlan[];
};

export type HeatPoint = {
  lat: number;
  lon: number;
  risks: RiskLevel[];
};

export type HeatmapResponse = {
  start_time: string;
  hours: number;
  points: HeatPoint[];
};

export type PlanRequest = {
  origin: string;
  destination: string;
  departure: string;
  load_weight_lb: number;
  sample_miles: number;
};
