from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AskView,
    ChatHistoryView,
    ChatSessionViewSet,
    SearchSuggestView,
    SuggestionsView,
)

router = DefaultRouter()
router.register("assistant/sessions", ChatSessionViewSet, basename="chat-session")

app_name = "assistant"

urlpatterns = [
    path("assistant/ask/", AskView.as_view(), name="ask"),
    path("assistant/suggestions/", SuggestionsView.as_view(), name="suggestions"),
    path("assistant/suggest/", SearchSuggestView.as_view(), name="suggest"),
    path(
        "assistant/history/<uuid:session_id>/",
        ChatHistoryView.as_view(),
        name="history",
    ),
    path("", include(router.urls)),
]
