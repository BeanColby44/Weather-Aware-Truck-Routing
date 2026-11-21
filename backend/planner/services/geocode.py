"""Geocoding via Nominatim. Calls are spaced to respect the public usage policy."""

from __future__ import annotations

import threading
import time

import requests
from django.conf import settings

from planner.services.risk import PlannerError

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_lock = threading.Lock()
_last_call = 0.0


def geocode(query: str, session: requests.Session | None = None) -> dict:
    global _last_call
    client = session or requests.Session()
    with _lock:
        wait = 1.05 - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()
        try:
            response = client.get(
                NOMINATIM_URL,
                params={"q": query, "format": "jsonv2", "limit": 1},
                headers={
                    "User-Agent": settings.NOMINATIM_USER_AGENT,
                    "Accept": "application/json",
                },
                timeout=20,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise PlannerError("Geocoding is unavailable right now. Try again.", 502) from exc

    payload = response.json()
    if not payload:
        raise PlannerError(f'Could not find "{query}". Try a city and state, such as Chicago, IL.', 404)
    hit = payload[0]
    return {
        "query": query,
        "label": hit.get("display_name") or query,
        "lat": float(hit["lat"]),
        "lon": float(hit["lon"]),
    }
