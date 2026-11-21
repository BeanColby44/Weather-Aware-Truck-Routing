"""Build a scored trip plan from geocoding, routing, and weather."""

from __future__ import annotations

import requests

from planner.services.geocode import geocode
from planner.services.geo import cumulative_miles
from planner.services.risk import format_duration, rank_routes, recommendation_text
from planner.services.routes import fetch_routes
from planner.services.sampling import sample_checkpoints, score_checkpoints
from planner.services.weather import fetch_series

ROUTE_LABELS = ("Route A", "Route B", "Route C")


def build_plan(origin: str, destination: str, departure, load_weight_lb: float, sample_miles: int, session: requests.Session | None = None) -> dict:
    client = session or requests.Session()
    origin_hit = geocode(origin, client)
    destination_hit = geocode(destination, client)
    raw_routes, provider, note = fetch_routes(origin_hit, destination_hit, client)

    prepared = []
    weather_points = []
    for raw in raw_routes:
        coords = raw["geometry"]["coordinates"]
        totals = cumulative_miles(coords)
        geometry_miles = totals[-1] if totals else 0.0
        checkpoints = sample_checkpoints(coords, sample_miles, departure, raw["duration_seconds"])
        prepared.append((raw, checkpoints, geometry_miles))
        weather_points.extend((checkpoint["lat"], checkpoint["lon"]) for checkpoint in checkpoints)

    series = fetch_series(weather_points, client)
    cursor = 0
    routes = []
    any_outside = False
    for index, (raw, checkpoints, geometry_miles) in enumerate(prepared):
        chunk = series[cursor : cursor + len(checkpoints)]
        cursor += len(checkpoints)
        for checkpoint, hourly in zip(checkpoints, chunk):
            sample = hourly.at(checkpoint["eta"])
            checkpoint.update(sample)
            any_outside = any_outside or sample["forecast_outside_window"]
        summary, segments = score_checkpoints(checkpoints, load_weight_lb)
        for checkpoint in checkpoints:
            checkpoint["wind_mph"] = round(checkpoint["wind_mph"], 1)
            checkpoint["rain_in_hr"] = round(checkpoint["rain_in_hr"], 2)
            checkpoint["snow_in_hr"] = round(checkpoint["snow_in_hr"], 2)
        routes.append(
            {
                "id": f"route-{index + 1}",
                "label": ROUTE_LABELS[index],
                "recommended": False,
                "distance_miles": round(geometry_miles, 1),
                "duration_seconds": round(raw["duration_seconds"]),
                "duration_label": format_duration(raw["duration_seconds"]),
                "geometry": raw["geometry"],
                "risk_summary": summary,
                "segments": segments,
                "checkpoints": checkpoints,
            }
        )

    rank_routes(routes)
    recommended = next(route["id"] for route in routes if route["recommended"])
    return {
        "origin": origin_hit,
        "destination": destination_hit,
        "departure": departure.isoformat(),
        "load_weight_lb": load_weight_lb,
        "sample_miles": sample_miles,
        "routing_provider": provider,
        "routing_note": note,
        "forecast_note": (
            "Some stops are past the 7-day forecast. The nearest hour was used."
            if any_outside
            else None
        ),
        "recommended_route_id": recommended,
        "recommendation": recommendation_text(routes),
        "criteria": [
            "Fewest no-travel miles",
            "Fewest severe miles",
            "Fewest high miles",
            "Lowest average risk",
            "Shortest travel time",
        ],
        "routes": routes,
    }
