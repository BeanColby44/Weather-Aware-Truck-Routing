from django.test import SimpleTestCase

from planner.services.geo import checkpoint_miles, cumulative_miles, haversine_miles, point_at_mile
from planner.services.risk import (
    apply_load_to_wind,
    classify_checkpoint,
    rain_band,
    rank_routes,
    snow_band,
    summarize_segments,
    wind_band,
)


class WindBandTests(SimpleTestCase):
    def test_boundaries(self):
        self.assertEqual(wind_band(24.9), "low")
        self.assertEqual(wind_band(25), "moderate")
        self.assertEqual(wind_band(34.9), "moderate")
        self.assertEqual(wind_band(35), "high")
        self.assertEqual(wind_band(44.9), "high")
        self.assertEqual(wind_band(45), "severe")
        self.assertEqual(wind_band(54.9), "severe")
        self.assertEqual(wind_band(55), "no_travel")

    def test_load_rules(self):
        self.assertEqual(apply_load_to_wind(60, 10_000), ("no_travel", False))
        self.assertEqual(apply_load_to_wind(50, 30_000), ("severe", False))
        self.assertEqual(apply_load_to_wind(50, 30_001), ("no_travel", True))
        self.assertEqual(apply_load_to_wind(40, 40_000), ("high", False))
        self.assertEqual(apply_load_to_wind(40, 40_001), ("severe", True))
        self.assertEqual(apply_load_to_wind(20, 80_000), ("low", False))


class RainSnowTests(SimpleTestCase):
    def test_rain_boundaries(self):
        self.assertEqual(rain_band(0.09), "low")
        self.assertEqual(rain_band(0.10), "moderate")
        self.assertEqual(rain_band(0.25), "high")
        self.assertEqual(rain_band(0.50), "severe")
        self.assertEqual(rain_band(1.00), "severe")
        self.assertEqual(rain_band(1.01), "no_travel")

    def test_snow_boundaries(self):
        self.assertEqual(snow_band(0.49), "low")
        self.assertEqual(snow_band(0.5), "moderate")
        self.assertEqual(snow_band(1.0), "high")
        self.assertEqual(snow_band(2.0), "severe")
        self.assertEqual(snow_band(3.0), "severe")
        self.assertEqual(snow_band(3.01), "no_travel")


class ClassifyTests(SimpleTestCase):
    def test_worst_condition_wins(self):
        result = classify_checkpoint(10, 0.02, 2.4, 10_000)
        self.assertEqual(result["level"], "severe")
        self.assertIn("Snow", result["reason"])

    def test_load_upgrade_is_called_out(self):
        result = classify_checkpoint(40, 0, 0, 42_000)
        self.assertEqual(result["level"], "severe")
        self.assertTrue(result["load_rule_applied"])
        self.assertIn("40,000 lb", result["reason"])


class SegmentTests(SimpleTestCase):
    def test_segment_uses_worse_end_and_average(self):
        checkpoints = [
            {"mile": 0, "level": "low"},
            {"mile": 25, "level": "severe"},
            {"mile": 50, "level": "low"},
        ]
        totals, segments, average = summarize_segments(checkpoints)
        self.assertEqual(len(segments), 2)
        self.assertEqual(totals["severe"], 50)
        self.assertEqual(totals["low"], 0)
        self.assertAlmostEqual(average, 4.0)

    def test_mixed_average(self):
        checkpoints = [
            {"mile": 0, "level": "low"},
            {"mile": 25, "level": "low"},
            {"mile": 50, "level": "severe"},
        ]
        totals, _segments, average = summarize_segments(checkpoints)
        self.assertAlmostEqual(totals["low"], 25)
        self.assertAlmostEqual(totals["severe"], 25)
        self.assertAlmostEqual(average, 2.5)


class RankTests(SimpleTestCase):
    def _route(self, route_id, no_travel, severe, high, average, duration):
        return {
            "id": route_id,
            "duration_seconds": duration,
            "risk_summary": {
                "no_travel_miles": no_travel,
                "severe_miles": severe,
                "high_miles": high,
                "average_risk": average,
            },
        }

    def test_no_travel_outranks_a_faster_cleaner_severe_route(self):
        routes = [
            self._route("fast", 10, 0, 0, 1.2, 100),
            self._route("safe", 0, 30, 10, 3.0, 400),
        ]
        rank_routes(routes)
        self.assertTrue(routes[1]["recommended"])
        self.assertFalse(routes[0]["recommended"])

    def test_severe_then_high_then_average_then_time(self):
        routes = [
            self._route("a", 0, 10, 0, 2, 100),
            self._route("b", 0, 5, 40, 3, 500),
            self._route("c", 0, 5, 40, 2, 800),
            self._route("d", 0, 5, 40, 2, 300),
        ]
        rank_routes(routes)
        self.assertEqual(routes[3]["id"], "d")
        self.assertTrue(routes[3]["recommended"])


class GeoTests(SimpleTestCase):
    def test_checkpoint_spacing_includes_the_end(self):
        self.assertEqual(checkpoint_miles(40, 25), [0.0, 25.0, 40.0])
        self.assertEqual(checkpoint_miles(50, 25), [0.0, 25.0, 50.0])

    def test_point_at_mile_interpolates(self):
        coords = [[-87.0, 41.0], [-87.0, 42.0]]
        totals = cumulative_miles(coords)
        self.assertAlmostEqual(totals[-1], haversine_miles(-87, 41, -87, 42))
        lon, lat = point_at_mile(coords, totals, totals[-1] / 2)
        self.assertAlmostEqual(lon, -87.0, places=4)
        self.assertAlmostEqual(lat, 41.5, places=2)
