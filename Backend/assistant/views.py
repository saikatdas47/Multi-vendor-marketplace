from django.conf import settings
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
)
from rest_framework import status, viewsets
from rest_framework.generics import get_object_or_404
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from core.ai import AIUnavailable
from core.permissions import IsCustomer, IsCustomerOrAnonymous
from products.models import Category, Product
from products.serializers import ProductListSerializer

from .models import ChatMessage, ChatSession
from .retrieval import parse_category, parse_constraints, retrieve, search_terms
from .serializers import (
    AskSerializer,
    ChatMessageSerializer,
    ChatSessionSerializer,
)
from .services import ask, get_or_create_session, search_only


class AssistantThrottle(ScopedRateThrottle):
    scope = "ai"


SUGGESTIONS = [
    "I need a laptop under $1000",
    "Suggest a gift for a gamer",
    "What's your best rated audio product?",
    "Show me something under $50",
    "What should I buy for a college student?",
]


@extend_schema(
    tags=["ai"],
    summary="Ask the shopping assistant",
    description=(
        "Answers product questions grounded in the live catalogue.\n\n"
        "Retrieval is deterministic (price/category parsing plus PostgreSQL "
        "full-text search); the LLM only writes prose about the shortlist it is "
        "given, and may cite nothing outside it. Products in the response are "
        "re-read from the database, so price and stock are always current.\n\n"
        "Works for guests — pass back the `session_id` you receive to continue "
        "a conversation. Throttled to the `ai` rate."
    ),
    request=AskSerializer,
)
class AskView(APIView):
    permission_classes = [IsCustomerOrAnonymous]
    throttle_classes = [AssistantThrottle]

    def post(self, request):
        serializer = AskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.validated_data["message"]

        # With no API key the feature still does something useful: it degrades
        # to plain catalogue search rather than returning an error.
        if not settings.AI_ENABLED:
            products, meta = search_only(question)
            return Response(
                {
                    "session_id": None,
                    "reply": (
                        f"Found {len(products)} matching product(s)."
                        if products
                        else "I couldn't find anything matching that."
                    ),
                    "products": ProductListSerializer(
                        products, many=True, context={"request": request}
                    ).data,
                    "ai": False,
                    "meta": meta,
                }
            )

        session = get_or_create_session(
            serializer.validated_data.get("session_id"), request.user
        )

        try:
            reply, products, meta = ask(session=session, question=question)
        except AIUnavailable as exc:
            # Same graceful path as above, plus the reason.
            products, meta = search_only(question)
            return Response(
                {
                    "session_id": str(session.id),
                    "reply": str(exc),
                    "products": ProductListSerializer(
                        products, many=True, context={"request": request}
                    ).data,
                    "ai": False,
                    "meta": meta,
                },
                status=status.HTTP_200_OK,
            )

        return Response(
            {
                "session_id": str(session.id),
                "reply": reply,
                "products": ProductListSerializer(
                    products, many=True, context={"request": request}
                ).data,
                "ai": True,
                "meta": meta,
            }
        )


@extend_schema(
    tags=["ai"],
    summary="Instant search suggestions",
    description=(
        "Powers the AI search bar. Deliberately **uses no LLM**: it reuses the "
        "assistant's natural-language parser (price ranges, sort intent, "
        "category matching) plus PostgreSQL full-text search.\n\n"
        "That keeps it fast enough to run on every keystroke and free to call, "
        "while still 'understanding' the query — the parsed filters come back as "
        "`understood` so the UI can show the user what it inferred.\n\n"
        "For a conversational answer, hand the same query to `assistant/ask/`."
    ),
    parameters=[
        OpenApiParameter("q", str, required=True, description="Partial query."),
        OpenApiParameter("limit", int, description="Max products (1-10, default 6)."),
    ],
)
class SearchSuggestView(APIView):
    permission_classes = [IsCustomerOrAnonymous]

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            return Response(
                {"query": query, "products": [], "categories": [], "understood": {}}
            )

        try:
            limit = min(max(int(request.query_params.get("limit", 6)), 1), 10)
        except (TypeError, ValueError):
            limit = 6

        products, meta = retrieve(query, limit=limit)

        # Category jumps: a shopper typing "audio" usually wants the category
        # page, not just products whose names happen to contain the word.
        terms = search_terms(query) or query.lower()
        category_qs = Category.objects.filter(is_active=True)
        matched = [
            c
            for c in category_qs
            if any(word in c.name.lower() for word in terms.split() if len(word) > 2)
        ][:4]

        # What the parser inferred, in a shape the UI can render as chips.
        understood = {}
        constraints = parse_constraints(query)
        if constraints["min_price"]:
            understood["min_price"] = str(constraints["min_price"])
        if constraints["max_price"]:
            understood["max_price"] = str(constraints["max_price"])
        if constraints["ordering"]:
            understood["ordering"] = constraints["ordering"]
        category_id = parse_category(query)
        if category_id:
            category = category_qs.filter(pk=category_id).first()
            if category:
                understood["category"] = {"name": category.name, "slug": category.slug}

        return Response(
            {
                "query": query,
                "understood": understood,
                "strategy": meta["strategy"],
                "categories": [
                    {"id": str(c.id), "name": c.name, "slug": c.slug} for c in matched
                ],
                "products": ProductListSerializer(
                    products, many=True, context={"request": request}
                ).data,
                "ai_available": settings.AI_ENABLED,
            }
        )


@extend_schema(tags=["ai"], summary="Suggested opening questions")
class SuggestionsView(APIView):
    permission_classes = [IsCustomerOrAnonymous]

    def get(self, request):
        return Response({"suggestions": SUGGESTIONS, "ai": settings.AI_ENABLED})


@extend_schema(tags=["ai"], summary="Replay a conversation")
class ChatHistoryView(APIView):
    permission_classes = [IsCustomerOrAnonymous]

    def get(self, request, session_id=None):
        session = get_object_or_404(ChatSession, pk=session_id)

        # A signed-in user's session must not be readable by a guest holding the
        # id. Guest sessions (user is NULL) stay open, since the id is the only
        # credential they have.
        if session.user_id and session.user_id != getattr(request.user, "id", None):
            return Response(status=status.HTTP_404_NOT_FOUND)

        messages = list(session.messages.all())

        # One query for every product referenced anywhere in the transcript,
        # rather than one per message.
        ids = {pid for m in messages for pid in m.product_ids}
        product_map = {
            str(p.pk): p
            for p in Product.objects.filter(pk__in=ids)
            .select_related("seller", "category")
            .prefetch_related("images")
            .with_ratings()
        }

        return Response(
            {
                "session": ChatSessionSerializer(session).data,
                "messages": ChatMessageSerializer(
                    messages,
                    many=True,
                    context={"request": request, "product_map": product_map},
                ).data,
            }
        )


@extend_schema_view(list=extend_schema(tags=["ai"], summary="My conversations"))
class ChatSessionViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ChatSessionSerializer
    permission_classes = [IsCustomer]

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)
