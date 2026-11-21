"""Up to three driving routes. Truck routing when an OpenRouteService key is set."""

from __future__ import annotations

import requests
from django.conf import settings

from planner.services.geo import bearing_deg, destination_point, haversine_miles
from planner.services.risk import PlannerError

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-hgv/geojson"


def fetch_routes(origin: dict, destination: dict, session: requests.Session | None = None) -> tuple[list[dict], str, str | None]:
    straight = haversine_miles(origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    if straight < 1:
        raise PlannerError("Origin and destination resolve to the same place. Choose two different cities.")

    client = session or requests.Session()
    note = None
    provider = "osrm"
    routes: list[dict] = []

    if settings.ORS_API_KEY:
        try:
            routes = _openrouteservice(origin, destination, client)
            provider = "openrouteservice"
        except PlannerError as exc:
            note = f"Truck routing was unavailable ({exc.message}). Driving routes are shown instead."
        except requests.RequestException:
            note = "Truck routing was unavailable. Driving routes are shown instead."

    if provider != "openrouteservice":
        try:
            routes = _osrm_alternatives(origin, destination, client)
            routes = _add_via_routes(origin, destination, routes, client)
        except requests.RequestException as exc:
            raise PlannerError("The routing service did not respond. Try again.", 502) from exc

    return _finalize(routes), provider, note


def _finalize(routes: list[dict]) -> list[dict]:
    unique = []
    seen = set()
    for route in routes:
        coords = route["geometry"]["coordinates"]
        if len(coords) < 2:
            continue
        mid = coords[len(coords) // 2]
        signature = (
            round(route["distance_meters"] / 800),
            round(mid[0], 1),
            round(mid[1], 1),
        )
        if signature in seen:
            continue
        seen.add(signature)
        unique.append(route)
        if len(unique) == 3:
            break
    if not unique:
        raise PlannerError("No drivable route was found between those places.", 404)
    return unique


def _osrm_alternatives(origin: dict, destination: dict, client: requests.Session) -> list[dict]:
    last_error = None
    for alternatives in ("3", "true"):
        try:
            return _osrm_path([origin, destination], client, alternatives)
        except requests.HTTPError as exc:
            last_error = exc
            if alternatives == "true":
                raise
    if last_error:
        raise last_error
    return []


def _add_via_routes(origin: dict, destination: dict, routes: list[dict], client: requests.Session) -> list[dict]:
    if len(routes) >= 3:
        return routes
    heading = bearing_deg(origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    distance = haversine_miles(origin["lon"], origin["lat"], destination["lon"], destination["lat"])
    mid_lat = (origin["lat"] + destination["lat"]) / 2
    mid_lon = (origin["lon"] + destination["lon"]) / 2
    offsets = (
        max(12, min(70, distance * 0.16)),
        max(20, min(110, distance * 0.28)),
    )
    collected = list(routes)
    for offset in offsets:
        for sign in (1, -1):
            if len(collected) >= 5:
                return collected
            via_lat, via_lon = destination_point(mid_lat, mid_lon, heading + 90 * sign, offset)
            via = {"lat": via_lat, "lon": via_lon}
            try:
                collected.extend(_osrm_path([origin, via, destination], client, "false"))
            except (requests.RequestException, PlannerError):
                continue
    return collected


def _osrm_path(places: list[dict], client: requests.Session, alternatives: str) -> list[dict]:
    coord_path = ";".join(f"{place['lon']},{place['lat']}" for place in places)
    response = client.get(
        f"{OSRM_URL}/{coord_path}",
        params={
            "alternatives": alternatives,
            "overview": "full",
            "geometries": "geojson",
            "steps": "false",
        },
        headers={"User-Agent": settings.NOMINATIM_USER_AGENT},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") != "Ok":
        raise PlannerError("No drivable route was found between those places.", 404)
    routes = []
    for item in payload.get("routes", []):
        geometry = item.get("geometry") or {}
        routes.append(
            {
                "distance_meters": float(item.get("distance") or 0),
                "duration_seconds": float(item.get("duration") or 0),
                "geometry": {"type": "LineString", "coordinates": geometry.get("coordinates") or []},
            }
        )
    return routes


def _openrouteservice(origin: dict, destination: dict, client: requests.Session) -> list[dict]:
    response = client.post(
        ORS_URL,
        headers={
            "Authorization": settings.ORS_API_KEY,
            "Content-Type": "application/json",
            "User-Agent": settings.NOMINATIM_USER_AGENT,
        },
        json={
            "coordinates": [
                [origin["lon"], origin["lat"]],
                [destination["lon"], destination["lat"]],
            ],
            "alternative_routes": {
                "target_count": 2,
                "share_factor": 0.6,
                "weight_factor": 1.4,
            },
        },
        timeout=40,
    )
    if response.status_code >= 400:
        detail = "request failed"
        try:
            body = response.json()
            error = body.get("error")
            if isinstance(error, dict):
                detail = error.get("message") or detail
            elif error:
                detail = str(error)
        except ValueError:
            detail = response.text[:180] or detail
        raise PlannerError(detail, 502)
    routes = []
    for feature in response.json().get("features", []):
        summary = (feature.get("properties") or {}).get("summary") or {}
        geometry = feature.get("geometry") or {}
        routes.append(
            {
                "distance_meters": float(summary.get("distance") or 0),
                "duration_seconds": float(summary.get("duration") or 0),
                "geometry": {"type": "LineString", "coordinates": geometry.get("coordinates") or []},
            }
        )
    if not routes:
        raise PlannerError("OpenRouteService returned no routes.", 502)
    return routes
