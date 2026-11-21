"""Place weather checkpoints along a route and slice the line by risk."""

from __future__ import annotations

from datetime import datetime, timedelta

from planner.services.geo import checkpoint_miles, cumulative_miles, point_at_mile
from planner.services.risk import classify_checkpoint, label_for_score, summarize_segments


def sample_checkpoints(coords: list[list[float]], interval: float, departure: datetime, duration_seconds: float) -> list[dict]:
    totals = cumulative_miles(coords)
    total = totals[-1] if totals else 0.0
    points = []
    for mile in checkpoint_miles(total, interval):
        lon, lat = point_at_mile(coords, totals, mile)
        fraction = 0.0 if total <= 0 else min(1.0, mile / total)
        eta = departure + timedelta(seconds=duration_seconds * fraction)
        points.append(
            {
                "mile": round(mile, 2),
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "eta": eta,
            }
        )
    return points


def score_checkpoints(checkpoints: list[dict], load_lb: float) -> tuple[dict, list[dict]]:
    for checkpoint in checkpoints:
        classified = classify_checkpoint(
            checkpoint["wind_mph"],
            checkpoint["rain_in_hr"],
            checkpoint["snow_in_hr"],
            load_lb,
        )
        checkpoint.update(classified)
        checkpoint["eta"] = checkpoint["eta"].isoformat()

    totals, segments, average = summarize_segments(checkpoints)
    summary = {
        "low_miles": round(totals["low"], 2),
        "moderate_miles": round(totals["moderate"], 2),
        "high_miles": round(totals["high"], 2),
        "severe_miles": round(totals["severe"], 2),
        "no_travel_miles": round(totals["no_travel"], 2),
        "average_risk": round(average, 2),
        "average_label": label_for_score(average),
    }
    return summary, segments
