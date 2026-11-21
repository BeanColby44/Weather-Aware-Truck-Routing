"""Weather risk bands and load adjustments from the assessment rules."""

from __future__ import annotations

LEVELS = ("low", "moderate", "high", "severe", "no_travel")

LEVEL_SCORE = {
    "low": 1,
    "moderate": 2,
    "high": 3,
    "severe": 4,
    "no_travel": 5,
}

LEVEL_LABEL = {
    "low": "Low",
    "moderate": "Moderate",
    "high": "High",
    "severe": "Severe",
    "no_travel": "No Travel",
}


class PlannerError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def worse(left: str, right: str) -> str:
    if LEVEL_SCORE[left] >= LEVEL_SCORE[right]:
        return left
    return right


def wind_band(mph: float) -> str:
    """Base wind band. 25, 35, and 45 start the next band. 55 is No Travel."""
    if mph >= 55:
        return "no_travel"
    if mph >= 45:
        return "severe"
    if mph >= 35:
        return "high"
    if mph >= 25:
        return "moderate"
    return "low"


def apply_load_to_wind(mph: float, load_lb: float) -> tuple[str, bool]:
    """Return the wind level after load rules, and whether a load rule changed it.

    Boundaries follow the written bands: 45–54 means 45 inclusive up to 55,
    and 35–44 means 35 inclusive up to 45. Load cutoffs use a strict greater-than.
    """
    base = wind_band(mph)
    if mph >= 55:
        return "no_travel", False
    if 45 <= mph < 55 and load_lb > 30_000:
        return "no_travel", True
    if 35 <= mph < 45 and load_lb > 40_000:
        return "severe", True
    return base, False


def rain_band(inches_per_hour: float) -> str:
    """Shared edges belong to the higher band. 1.00 in/hr is still Severe."""
    if inches_per_hour > 1.0:
        return "no_travel"
    if inches_per_hour >= 0.50:
        return "severe"
    if inches_per_hour >= 0.25:
        return "high"
    if inches_per_hour >= 0.10:
        return "moderate"
    return "low"


def snow_band(inches_per_hour: float) -> str:
    """Shared edges belong to the higher band. 3.0 in/hr is still Severe."""
    if inches_per_hour > 3.0:
        return "no_travel"
    if inches_per_hour >= 2.0:
        return "severe"
    if inches_per_hour >= 1.0:
        return "high"
    if inches_per_hour >= 0.5:
        return "moderate"
    return "low"


def label_for_score(score: float) -> str:
    if score < 1.5:
        return "Low"
    if score < 2.5:
        return "Moderate"
    if score < 3.5:
        return "High"
    if score < 4.5:
        return "Severe"
    return "No Travel"


def _fmt_rate(value: float) -> str:
    return f"{value:.2f}"


def _fmt_wind(value: float) -> str:
    return f"{value:.0f}"


def _fmt_load(value: float) -> str:
    return f"{value:,.0f}"


def classify_checkpoint(wind_mph: float, rain_in_hr: float, snow_in_hr: float, load_lb: float) -> dict:
    wind_level, load_applied = apply_load_to_wind(wind_mph, load_lb)
    rain_level = rain_band(rain_in_hr)
    snow_level = snow_band(snow_in_hr)
    overall = wind_level
    overall = worse(overall, rain_level)
    overall = worse(overall, snow_level)

    if overall == "low":
        reason = "Wind, rain, and snow are all Low."
    else:
        notes = []
        if wind_level == overall:
            if load_applied and wind_level == "no_travel":
                notes.append(
                    f"Wind {_fmt_wind(wind_mph)} mph with a {_fmt_load(load_lb)} lb load is No Travel "
                    "(over 30,000 lb in the 45–54 mph band)."
                )
            elif load_applied and wind_level == "severe":
                notes.append(
                    f"Wind {_fmt_wind(wind_mph)} mph with a {_fmt_load(load_lb)} lb load is Severe "
                    "(over 40,000 lb in the 35–44 mph band)."
                )
            elif wind_mph >= 55 and wind_level == "no_travel":
                notes.append(f"Wind {_fmt_wind(wind_mph)} mph is No Travel for any load.")
            else:
                notes.append(f"Wind {_fmt_wind(wind_mph)} mph is {LEVEL_LABEL[wind_level]}.")
        if rain_level == overall:
            notes.append(f"Rain {_fmt_rate(rain_in_hr)} in/hr is {LEVEL_LABEL[rain_level]}.")
        if snow_level == overall:
            notes.append(f"Snow {_fmt_rate(snow_in_hr)} in/hr is {LEVEL_LABEL[snow_level]}.")
        reason = " ".join(notes)

    return {
        "level": overall,
        "wind_level": wind_level,
        "rain_level": rain_level,
        "snow_level": snow_level,
        "load_rule_applied": load_applied,
        "reason": reason,
    }


def summarize_segments(checkpoints: list[dict]) -> tuple[dict, list[dict], float]:
    """Miles between checkpoints take the worse risk of the two ends."""
    totals = {level: 0.0 for level in LEVELS}
    segments = []
    weighted = 0.0
    counted = 0.0

    if len(checkpoints) < 2:
        return totals, segments, 0.0

    for start, end in zip(checkpoints, checkpoints[1:]):
        length = max(0.0, float(end["mile"]) - float(start["mile"]))
        level = worse(start["level"], end["level"])
        totals[level] += length
        weighted += LEVEL_SCORE[level] * length
        counted += length
        segments.append(
            {
                "from_mile": round(float(start["mile"]), 2),
                "to_mile": round(float(end["mile"]), 2),
                "miles": round(length, 2),
                "level": level,
            }
        )

    average = weighted / counted if counted else 0.0
    return totals, segments, average


def rank_routes(routes: list[dict]) -> list[dict]:
    """Safest first: no-travel miles, severe, high, average risk, then travel time."""

    def sort_key(route: dict):
        summary = route["risk_summary"]
        return (
            summary["no_travel_miles"],
            summary["severe_miles"],
            summary["high_miles"],
            summary["average_risk"],
            route["duration_seconds"],
        )

    ordered = sorted(routes, key=sort_key)
    safest_id = ordered[0]["id"] if ordered else None
    for route in routes:
        route["recommended"] = route["id"] == safest_id
    return routes


def recommendation_text(routes: list[dict]) -> str:
    winner = next(route for route in routes if route["recommended"])
    summary = winner["risk_summary"]
    return (
        f"{winner['label']}: "
        f"{summary['no_travel_miles']:.1f} no-travel mi, "
        f"{summary['severe_miles']:.1f} severe mi, "
        f"{summary['high_miles']:.1f} high mi, "
        f"avg risk {summary['average_risk']:.2f} ({summary['average_label']}), "
        f"{format_duration(winner['duration_seconds'])}."
    )


def format_duration(seconds: float) -> str:
    minutes = int(round(seconds / 60))
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"
