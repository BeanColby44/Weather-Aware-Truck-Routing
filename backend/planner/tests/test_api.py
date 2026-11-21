import tempfile
from datetime import datetime, timezone
from pathlib import Path

from django.core import mail
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from planner.services.geocode import place_label, suggest
from planner.services.validate import parse_plan_request


class ValidateTests(SimpleTestCase):
    def test_accepts_a_complete_trip(self):
        parsed = parse_plan_request(
            {
                "origin": "Chicago, IL",
                "destination": "St. Louis, MO",
                "departure": "2026-10-14T13:00:00Z",
                "load_weight_lb": 42000,
                "sample_miles": 25,
            }
        )
        self.assertEqual(parsed["sample_miles"], 25)
        self.assertEqual(parsed["departure"], datetime(2026, 10, 14, 13, 0, tzinfo=timezone.utc))

    def test_rejects_unknown_interval(self):
        with self.assertRaisesMessage(Exception, "10, 25, or 50"):
            parse_plan_request(
                {
                    "origin": "Chicago, IL",
                    "destination": "St. Louis, MO",
                    "departure": "2026-10-14T13:00:00Z",
                    "load_weight_lb": 1000,
                    "sample_miles": 15,
                }
            )


class SuggestTests(SimpleTestCase):
    def test_place_label_skips_blank_and_repeated_parts(self):
        self.assertEqual(
            place_label({"name": "Chicago", "state": "Illinois", "country": "United States"}),
            "Chicago, Illinois, United States",
        )
        self.assertEqual(place_label({"name": "Paris", "city": "Paris", "country": "France"}), "Paris, France")

    def test_suggest_uses_photon_labels(self):
        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "features": [
                        {"properties": {"name": "Chicago", "state": "Illinois", "country": "United States"}},
                        {"properties": {"name": "Chicago", "state": "Illinois", "country": "United States"}},
                        {"properties": {"name": "Chico", "state": "California", "country": "United States"}},
                    ]
                }

        class FakeSession:
            def get(self, url, params, headers, timeout):
                self.url = url
                self.params = params
                return FakeResponse()

        session = FakeSession()
        labels = suggest("chic", session=session)
        self.assertEqual(
            labels,
            ["Chicago, Illinois, United States", "Chico, California, United States"],
        )
        self.assertEqual(session.params["q"], "chic")
        self.assertEqual(suggest("c"), [])

    def test_places_endpoint_returns_suggestions(self):
        from unittest.mock import patch

        client = APIClient()
        with patch("planner.views.suggest", return_value=["Dallas, Texas, United States"]):
            response = client.get("/api/places", {"q": "dal"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["suggestions"], ["Dallas, Texas, United States"])


class PlanApiTests(SimpleTestCase):
    def test_missing_fields_do_not_call_upstream(self):
        client = APIClient()
        response = client.post("/api/plan", {"origin": "Chicago"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.json())

    def test_health(self):
        client = APIClient()
        response = client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")


class ReviewApiTests(SimpleTestCase):
    def setUp(self):
        self.client = APIClient()
        self.tmp = tempfile.TemporaryDirectory()
        self.override = override_settings(
            REVIEW_STORE=Path(self.tmp.name) / "reviews.json",
            REVIEW_ADMIN_KEY="colbyleebean",
            EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
            EMAIL_HOST_PASSWORD="app-password",
            EMAIL_HOST_USER="colbybean321@gmail.com",
            FEEDBACK_TO="colbybean321@gmail.com",
        )
        self.override.enable()

    def tearDown(self):
        self.override.disable()
        self.tmp.cleanup()

    def test_reviews_are_shared_and_password_protects_changes(self):
        created = self.client.post(
            "/api/reviews",
            {"name": "Alex", "text": "Clear wind rules.", "stars": 4},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        review_id = created.json()["id"]
        listed = self.client.get("/api/reviews")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.json()["reviews"][0]["text"], "Clear wind rules.")

        denied = self.client.put(
            f"/api/reviews/{review_id}",
            {"name": "Alex", "text": "Changed.", "stars": 3},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        updated = self.client.put(
            f"/api/reviews/{review_id}",
            {"name": "Alex", "text": "Changed.", "stars": 3},
            format="json",
            HTTP_X_REVIEW_KEY="colbyleebean",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["stars"], 3)

        removed = self.client.delete(f"/api/reviews/{review_id}", HTTP_X_REVIEW_KEY="colbyleebean")
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(self.client.get("/api/reviews").json()["reviews"], [])

    def test_feedback_is_emailed(self):
        response = self.client.post(
            "/api/feedback",
            {"name": "Alex", "text": "The map labels were hard to read."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["colbybean321@gmail.com"])
        self.assertIn("hard to read", mail.outbox[0].body)

    def test_feedback_without_mail_password_is_refused(self):
        with override_settings(EMAIL_HOST_PASSWORD=""):
            response = self.client.post("/api/feedback", {"name": "Alex", "text": "Hello"}, format="json")
        self.assertEqual(response.status_code, 503)
