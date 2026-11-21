from django.urls import path

from planner.views import FeedbackView, HealthView, HeatmapView, PlacesView, PlanView, ReviewAuthView, ReviewDetailView, ReviewsView

urlpatterns = [
    path("health", HealthView.as_view()),
    path("plan", PlanView.as_view()),
    path("places", PlacesView.as_view()),
    path("heatmap", HeatmapView.as_view()),
    path("reviews", ReviewsView.as_view()),
    path("reviews/auth", ReviewAuthView.as_view()),
    path("reviews/<str:review_id>", ReviewDetailView.as_view()),
    path("feedback", FeedbackView.as_view()),
]
