"""Geocoding via Nominatim. Calls are spaced to respect the public usage policy."""

from __future__ import annotations

import threading
import time

import requests
from django.conf import settings

from planner.services.risk import PlannerError

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"
_lock = threading.Lock()
_last_call = 0.0
_suggest_cache: dict[str, list[str]] = {}
_suggest_lock = threading.Lock()


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


def suggest(query: str, session: requests.Session | None = None, limit: int = 5) -> list[str]:
    """Place names for a partial query. Photon is built for typeahead; Nominatim is not."""
    text = " ".join(query.split())
    if len(text) < 2:
        return []
    key = text.lower()
    with _suggest_lock:
        cached = _suggest_cache.get(key)
    if cached is not None:
        return cached

    client = session or requests.Session()
    try:
        response = client.get(
            PHOTON_URL,
            params={"q": text, "limit": limit, "lang": "en"},
            headers={
                "User-Agent": settings.NOMINATIM_USER_AGENT,
                "Accept": "application/json",
            },
            timeout=8,
        )
        response.raise_for_status()
        features = response.json().get("features") or []
    except (requests.RequestException, ValueError):
        return []

    labels: list[str] = []
    seen: set[str] = set()
    for feature in features:
        props = feature.get("properties") or {}
        label = place_label(props)
        folded = label.lower()
        if not label or folded in seen:
            continue
        seen.add(folded)
        labels.append(label)
        if len(labels) >= limit:
            break

    if labels:
        with _suggest_lock:
            if len(_suggest_cache) > 200:
                _suggest_cache.clear()
            _suggest_cache[key] = labels
    return labels


def place_label(props: dict) -> str:
    name = (
        props.get("name")
        or props.get("city")
        or props.get("town")
        or props.get("village")
        or props.get("county")
        or ""
    ).strip()
    state = (props.get("state") or "").strip()
    country = (props.get("country") or "").strip()
    parts: list[str] = []
    for part in (name, state, country):
        if part and part not in parts:
            parts.append(part)
    return ", ".join(parts)
