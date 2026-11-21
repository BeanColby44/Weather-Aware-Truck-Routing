from django.conf import settings
from django.core.mail import send_mail

from planner.services.reviews import ReviewError


def send_feedback(payload: object) -> None:
    if not settings.EMAIL_HOST_PASSWORD:
        raise ReviewError("Feedback email is not set up yet.", status=503)
    data = payload if isinstance(payload, dict) else {}
    raw_name = data.get("name", "")
    name = " ".join(raw_name.split()) if isinstance(raw_name, str) else ""
    if not name:
        name = "Driver"
    raw_text = data.get("text", "")
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise ReviewError("Write a message before sending.")
    text = raw_text.strip()
    if len(text) > 2000:
        raise ReviewError("Keep the message under 2,000 characters.")
    name = name[:80]
    send_mail(
        subject=f"Weather-Aware Truck Routing feedback from {name}",
        message=f"{name} wrote:\n\n{text}",
        from_email=settings.EMAIL_HOST_USER,
        recipient_list=[settings.FEEDBACK_TO],
        fail_silently=False,
    )
