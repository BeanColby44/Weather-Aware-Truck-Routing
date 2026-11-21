import hashlib
import hmac
import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings

_lock = threading.Lock()


class ReviewError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message = message
        self.status = status


def admin_configured() -> bool:
    return bool(_admin_key())


def admin_matches(key: str) -> bool:
    expected = _admin_key()
    if not expected or not isinstance(key, str) or not key.strip():
        return False
    offered = hashlib.sha256(key.encode("utf-8")).digest()
    wanted = hashlib.sha256(expected.encode("utf-8")).digest()
    return hmac.compare_digest(offered, wanted)


def list_reviews() -> list[dict]:
    with _lock:
        notes = _read()
    notes.sort(key=lambda note: note.get("at", ""), reverse=True)
    return notes


def create_review(payload: object) -> dict:
    note = {
        "id": uuid.uuid4().hex,
        "name": _name(payload),
        "text": _text(payload),
        "stars": _stars(payload),
        "at": _now(),
    }
    with _lock:
        notes = _read()
        if len(notes) >= 200:
            raise ReviewError("The review list is full.")
        notes.append(note)
        _write(notes)
    return note


def update_review(review_id: str, payload: object) -> dict:
    with _lock:
        notes = _read()
        for index, note in enumerate(notes):
            if note.get("id") != review_id:
                continue
            notes[index] = {
                **note,
                "name": _name(payload),
                "text": _text(payload),
                "stars": _stars(payload),
            }
            _write(notes)
            return notes[index]
    raise ReviewError("That review is not on the list.", status=404)


def require_admin(key: str) -> None:
    if not admin_configured():
        raise ReviewError("Review editing is not set up.", status=503)
    if not admin_matches(key):
        raise ReviewError("Wrong password.", status=403)


def delete_review(review_id: str) -> None:
    with _lock:
        notes = _read()
        kept = [note for note in notes if note.get("id") != review_id]
        if len(kept) == len(notes):
            raise ReviewError("That review is not on the list.", status=404)
        _write(kept)


def _admin_key() -> str:
    return str(getattr(settings, "REVIEW_ADMIN_KEY", "")).strip()


def _store_path() -> Path:
    return Path(settings.REVIEW_STORE)


def _read() -> list[dict]:
    path = _store_path()
    if not path.exists():
        return []
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    return [note for note in parsed if isinstance(note, dict) and isinstance(note.get("id"), str)]


def _write(notes: list[dict]) -> None:
    path = _store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(notes), encoding="utf-8")
    temporary.replace(path)


def _payload(payload: object) -> dict:
    return payload if isinstance(payload, dict) else {}


def _name(payload: object) -> str:
    raw = _payload(payload).get("name", "")
    if not isinstance(raw, str):
        raw = ""
    name = " ".join(raw.split())
    if not name:
        return "Driver"
    return name[:80]


def _text(payload: object) -> str:
    raw = _payload(payload).get("text", "")
    if not isinstance(raw, str):
        raise ReviewError("Write a review before posting.")
    text = raw.strip()
    if not text:
        raise ReviewError("Write a review before posting.")
    if len(text) > 2000:
        raise ReviewError("Keep the review under 2,000 characters.")
    return text


def _stars(payload: object) -> int:
    raw = _payload(payload).get("stars", 5)
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 1 or raw > 5:
        raise ReviewError("Choose a rating from 1 to 5 stars.")
    return raw


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()
