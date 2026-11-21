import logging

import requests
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from planner.services.geocode import suggest
from planner.services.heatmap import build_heatmap
from planner.services.plan import build_plan
from planner.services.risk import PlannerError
from planner.services.validate import parse_heatmap_request, parse_plan_request

logger = logging.getLogger(__name__)


class OpenAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]


class HealthView(OpenAPIView):
    def get(self, request):
        return Response({"status": "ok"})


class PlanView(OpenAPIView):
    def post(self, request):
        try:
            payload = parse_plan_request(request.data)
            return Response(build_plan(**payload))
        except PlannerError as exc:
            return Response({"error": exc.message}, status=exc.status)
        except requests.RequestException:
            logger.exception("plan upstream failed")
            return Response({"error": "A routing or weather service did not respond. Try again."}, status=502)
        except Exception:
            logger.exception("plan failed")
            return Response({"error": "Something went wrong while building the plan."}, status=500)


class PlacesView(OpenAPIView):
    def get(self, request):
        query = request.query_params.get("q", "")
        if not isinstance(query, str):
            query = ""
        return Response({"suggestions": suggest(query)})


class HeatmapView(OpenAPIView):
    def post(self, request):
        try:
            payload = parse_heatmap_request(request.data)
            return Response(build_heatmap(**payload))
        except PlannerError as exc:
            return Response({"error": exc.message}, status=exc.status)
        except requests.RequestException:
            logger.exception("heatmap upstream failed")
            return Response({"error": "The weather service did not respond. Try again."}, status=502)
        except Exception:
            logger.exception("heatmap failed")
            return Response({"error": "Something went wrong while building the forecast."}, status=500)
