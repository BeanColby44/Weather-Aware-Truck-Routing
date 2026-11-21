"""Request parsing for the plan and heatmap endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

from planner.services.risk import PlannerError

SAMPLE_MILES = {10, 25, 50}
MAX_COORDINATES = 20000


def parse_departure(value) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise PlannerError("Enter a departure date and time.")
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise PlannerError("Departure must be an ISO date and time.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_load(value) -> float:
    try:
        load = float(value)
    except (TypeError, ValueError) as exc:
        raise PlannerError("Enter load weight in pounds.") from exc
    if load <= 0 or load > 200_000:
        raise PlannerError("Load weight must be between 1 and 200,000 lb.")
    return load


def parse_plan_request(data) -> dict:
    if not isinstance(data, dict):
        raise PlannerError("Request body must be a JSON object.")
    origin = str(data.get("origin", "")).strip()
    destination = str(data.get("destination", "")).strip()
    if len(origin) < 2 or len(destination) < 2:
        raise PlannerError("Enter both an origin and a destination.")
    if len(origin) > 180 or len(destination) > 180:
        raise PlannerError("Origin and destination must be under 180 characters.")
    departure = parse_departure(data.get("departure"))
    load = parse_load(data.get("load_weight_lb"))
    try:
        sample = int(data.get("sample_miles", 25))
    except (TypeError, ValueError) as exc:
        raise PlannerError("Sample interval must be 10, 25, or 50 miles.") from exc
    if sample not in SAMPLE_MILES:
        raise PlannerError("Sample interval must be 10, 25, or 50 miles.")
    return {
        "origin": origin,
        "destination": destination,
        "departure": departure,
        "load_weight_lb": load,
        "sample_miles": sample,
    }


def parse_heatmap_request(data) -> dict:
    if not isinstance(data, dict):
        raise PlannerError("Request body must be a JSON object.")
    load = parse_load(data.get("load_weight_lb"))
    routes = data.get("routes")
    if not isinstance(routes, list) or not routes:
        raise PlannerError("Heatmap needs at least one route geometry.")
    geometries = []
    coordinate_count = 0
    for route in routes[:3]:
        geometry = route.get("geometry") if isinstance(route, dict) else None
        coords = geometry.get("coordinates") if isinstance(geometry, dict) else None
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        clean = []
        for pair in coords:
            if not isinstance(pair, (list, tuple)) or len(pair) < 2:
                continue
            try:
                clean.append([float(pair[0]), float(pair[1])])
            except (TypeError, ValueError):
                continue
        if len(clean) >= 2:
            geometries.append(clean)
            coordinate_count += len(clean)
        if coordinate_count > MAX_COORDINATES:
            raise PlannerError("Route geometry is too large to sample.")
    if not geometries:
        raise PlannerError("Heatmap needs a route line with at least two points.")
    return {"load_weight_lb": load, "geometries": geometries}
