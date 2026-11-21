from datetime import datetime, timezone

from django.test import SimpleTestCase
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
