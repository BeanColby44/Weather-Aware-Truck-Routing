"""Hourly forecast lookups from Open-Meteo, batched by coordinate."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import requests
from django.conf import settings

from planner.services.risk import PlannerError

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
CHUNK_SIZE = 40
CM_PER_INCH = 2.54


class HourlySeries:
    def __init__(self, times: list[datetime], wind: list[float], rain: list[float], snow: list[float]):
        self.times = times
        self.wind = wind
        self.rain = rain
        self.snow = snow

    def at(self, moment: datetime) -> dict:
        if not self.times:
            raise PlannerError("Weather service returned no hours.", 502)
        target = moment.astimezone(timezone.utc)
        index = min(range(len(self.times)), key=lambda item: abs(self.times[item] - target))
        outside = abs(self.times[index] - target) > timedelta(hours=2)
        return {
            "wind_mph": _number(self.wind, index),
            "rain_in_hr": _number(self.rain, index),
            "snow_in_hr": _number(self.snow, index),
            "forecast_outside_window": outside,
        }

    def risks_for_hours(self, start: datetime, hours: int, load_lb: float, classify) -> list[str]:
        levels = []
        for offset in range(hours):
            sample = self.at(start + timedelta(hours=offset))
            levels.append(
                classify(sample["wind_mph"], sample["rain_in_hr"], sample["snow_in_hr"], load_lb)["level"]
            )
        return levels


def fetch_series(points: list[tuple[float, float]], session: requests.Session | None = None) -> list[HourlySeries]:
    if not points:
        return []
    client = session or requests.Session()
    found: list[HourlySeries] = []
    for start in range(0, len(points), CHUNK_SIZE):
        chunk = points[start : start + CHUNK_SIZE]
        found.extend(_fetch_chunk(chunk, client))
    if len(found) != len(points):
        raise PlannerError("Weather service returned an unexpected number of locations.", 502)
    return found


def _fetch_chunk(points: list[tuple[float, float]], client: requests.Session) -> list[HourlySeries]:
    params = {
        "latitude": ",".join(f"{lat:.4f}" for lat, _lon in points),
        "longitude": ",".join(f"{lon:.4f}" for _lat, lon in points),
        "hourly": "wind_speed_10m,rain,snowfall",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": "UTC",
        "forecast_days": 7,
    }
    try:
        response = client.get(
            FORECAST_URL,
            params=params,
            headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
            timeout=40,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise PlannerError("The weather service did not respond. Try again.", 502) from exc

    payload = response.json()
    rows = payload if isinstance(payload, list) else [payload]
    if len(rows) != len(points):
        raise PlannerError("Weather service returned an unexpected number of locations.", 502)

    series = []
    for row in rows:
        hourly = row.get("hourly") or {}
        times = [_parse_hour(value) for value in hourly.get("time") or []]
        wind = [_or_zero(value) for value in hourly.get("wind_speed_10m") or []]
        rain = [_or_zero(value) for value in hourly.get("rain") or []]
        snow = [_or_zero(value) / CM_PER_INCH for value in hourly.get("snowfall") or []]
        length = min(len(times), len(wind), len(rain), len(snow))
        series.append(HourlySeries(times[:length], wind[:length], rain[:length], snow[:length]))
    return series


def _parse_hour(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _or_zero(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _number(values: list[float], index: int) -> float:
    if index >= len(values):
        return 0.0
    return round(values[index], 2)
