"""Corridor sample points for the 0–48 hour forecast slider."""

from __future__ import annotations

from datetime import datetime, timezone

import requests

from planner.services.geo import bearing_deg, checkpoint_miles, cumulative_miles, destination_point, point_at_mile
from planner.services.risk import classify_checkpoint
from planner.services.weather import fetch_series

HEATMAP_HOURS = 49
OFFSET_MILES = (0, 12)


def build_heatmap(geometries: list[list[list[float]]], load_weight_lb: float, session: requests.Session | None = None) -> dict:
    samples = _corridor_points(geometries)
    series = fetch_series([(lat, lon) for lat, lon in samples], session)
    start = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    points = []
    for (lat, lon), hourly in zip(samples, series):
        points.append(
            {
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "risks": hourly.risks_for_hours(start, HEATMAP_HOURS, load_weight_lb, classify_checkpoint),
            }
        )
    return {
        "start_time": start.isoformat(),
        "hours": HEATMAP_HOURS,
        "points": points,
    }


def _corridor_points(geometries: list[list[list[float]]]) -> list[tuple[float, float]]:
    grouped = [_points_along(coords) for coords in geometries]
    found: list[tuple[float, float]] = []
    seen = set()
    longest = max((len(group) for group in grouped), default=0)
    for index in range(longest):
        for group in grouped:
            if index >= len(group):
                continue
            lat, lon = group[index]
            key = (round(lat, 2), round(lon, 2))
            if key in seen:
                continue
            seen.add(key)
            found.append((lat, lon))
            if len(found) >= 90:
                return found
    return found


def _points_along(coords: list[list[float]]) -> list[tuple[float, float]]:
    totals = cumulative_miles(coords)
    total = totals[-1] if totals else 0.0
    if total <= 0:
        return []
    step = 15 if total > 80 else 8
    points = []
    for mile in checkpoint_miles(total, step):
        lon, lat = point_at_mile(coords, totals, mile)
        ahead = point_at_mile(coords, totals, min(total, mile + 1))
        heading = bearing_deg(lon, lat, ahead[0], ahead[1])
        for offset in OFFSET_MILES:
            signs = (1, -1) if offset else (1,)
            for sign in signs:
                if offset:
                    sample_lat, sample_lon = destination_point(lat, lon, heading + 90 * sign, offset)
                else:
                    sample_lat, sample_lon = lat, lon
                points.append((sample_lat, sample_lon))
    return points
