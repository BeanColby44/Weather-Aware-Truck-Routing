from datetime import datetime, timezone

from django.test import SimpleTestCase
from rest_framework.test import APIClient

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
