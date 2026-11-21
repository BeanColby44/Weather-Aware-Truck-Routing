"""Distance along a lon/lat path, in miles."""

from __future__ import annotations

import math

EARTH_MILES = 3958.7613


def haversine_miles(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_MILES * math.asin(math.sqrt(min(1.0, a)))


def cumulative_miles(coords: list[list[float]]) -> list[float]:
    if not coords:
        return []
    totals = [0.0]
    for index in range(1, len(coords)):
        lon1, lat1 = coords[index - 1]
        lon2, lat2 = coords[index]
        totals.append(totals[-1] + haversine_miles(lon1, lat1, lon2, lat2))
    return totals


def point_at_mile(coords: list[list[float]], totals: list[float], mile: float) -> tuple[float, float]:
    if mile <= 0:
        return coords[0][0], coords[0][1]
    if mile >= totals[-1]:
        return coords[-1][0], coords[-1][1]

    lo = 0
    hi = len(totals) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if totals[mid] < mile:
            lo = mid + 1
        else:
            hi = mid
    index = max(1, lo)
    span = totals[index] - totals[index - 1]
    fraction = 0.0 if span == 0 else (mile - totals[index - 1]) / span
    lon = coords[index - 1][0] + fraction * (coords[index][0] - coords[index - 1][0])
    lat = coords[index - 1][1] + fraction * (coords[index][1] - coords[index - 1][1])
    return lon, lat


def destination_point(lat: float, lon: float, bearing_deg: float, miles: float) -> tuple[float, float]:
    angular = miles / EARTH_MILES
    bearing = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular) + math.cos(lat1) * math.sin(angular) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular) * math.cos(lat1),
        math.cos(angular) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lon2)


def bearing_deg(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_lon = math.radians(lon2 - lon1)
    y = math.sin(d_lon) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(d_lon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def checkpoint_miles(total: float, interval: float) -> list[float]:
    if total <= 0:
        return [0.0]
    miles = []
    cursor = 0.0
    while cursor < total - 0.05:
        miles.append(round(cursor, 4))
        cursor += interval
    if not miles or abs(miles[-1] - total) > 0.05:
        miles.append(round(total, 4))
    else:
        miles[-1] = round(total, 4)
    return miles
