"""Assistant orchestration: retrieve, ground, answer, record."""

import logging
import re

from django.conf import settings

from core.ai import AIUnavailable, chat
from products.models import Product

from .models import ChatMessage, ChatSession
from .retrieval import retrieve, to_context

logger = logging.getLogger(__name__)

# How many previous turns to replay is configured in .env. Bounding it matters:
# an unbounded transcript is how a chat feature quietly becomes the most
# expensive endpoint in the app.

SYSTEM_PROMPT = """You are the shopping assistant for CommerceX, a multi-vendor marketplace.

You will be given a numbered list of products retrieved from the live catalogue.

Rules you must follow:
- Recommend ONLY products from that list. Never invent a product, price, brand or spec.
- Cite products by their number in square brackets, e.g. "the [2] is a good fit".
- If the list is empty or nothing matches, say so plainly and suggest how to broaden the search. Do not apologise repeatedly.
- Never state a price, rating or stock level that isn't in the list.
- If something is marked OUT OF STOCK, say so when you mention it.
- You cannot see the customer's cart or orders, and you cannot place orders. If asked, say that and point them to the relevant page.

Style: 2-4 short sentences, warm and direct. Compare on the attributes given
(price, rating, category). No bullet lists unless comparing three or more items.
No markdown headings."""


def _history_messages(session):
    turns = settings.ASSISTANT_HISTORY_TURNS
    recent = list(session.messages.order_by("-created_at")[: turns * 2])[::-1]
    return [{"role": m.role, "content": m.content} for m in recent]


def _cited_indices(reply, ceiling):
    """Extracts [n] citations, in first-mention order, deduplicated.

    Ordering matters: the products shown under the reply should appear in the
    order the assistant talked about them.
    """
    seen, ordered = set(), []
    for match in re.finditer(r"\[(\d{1,2})\]", reply):
        index = int(match.group(1))
        if 1 <= index <= ceiling and index not in seen:
            seen.add(index)
            ordered.append(index)
    return ordered


def get_or_create_session(session_id, user):
    """Resolves a client-supplied session id, or starts a fresh conversation."""
    session = None
    if session_id:
        session = ChatSession.objects.filter(pk=session_id).first()
        # A guest session becomes owned once that visitor signs in.
        if session and user and user.is_authenticated and session.user_id is None:
            session.user = user
            session.save(update_fields=["user", "updated_at"])
    if session is None:
        session = ChatSession.objects.create(
            user=user if user and user.is_authenticated else None
        )
    return session


def ask(*, session, question):
    """One assistant turn. Returns (reply_text, products, meta).

    Raises AIUnavailable if the model can't be reached — the caller turns that
    into a 503 with a readable message.
    """
    ChatMessage.objects.create(
        session=session, role=ChatMessage.Role.USER, content=question
    )

    # Retrieval happens first and without the LLM, so a model outage still
    # leaves us able to show search results (see the view's fallback).
    candidates, meta = retrieve(question, limit=settings.ASSISTANT_CANDIDATES)
    context = to_context(candidates) if candidates else "(no matching products)"

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *_history_messages(session),
        {
            "role": "user",
            "content": (
                f"Catalogue results for this question:\n{context}\n\n"
                f"Customer asked: {question}"
            ),
        },
    ]

    reply = chat(messages, max_tokens=settings.ASSISTANT_MAX_TOKENS, temperature=0.5)

    # Ground the response: only products the model actually cited are returned,
    # and they're re-read from the DB rather than trusted from the prompt, so
    # price and stock shown to the customer are always live.
    indices = _cited_indices(reply, len(candidates))
    cited = [candidates[i - 1] for i in indices]

    # If it recommended nothing explicitly but we did find matches, show the top
    # few anyway — the customer asked a product question and deserves products.
    if not cited and candidates:
        cited = candidates[:3]
        meta["fallback_products"] = True

    products = list(
        Product.objects.filter(pk__in=[p.pk for p in cited])
        .select_related("seller", "category")
        .prefetch_related("images")
        .with_ratings()
    )
    # Preserve citation order, which the DB query does not guarantee.
    order = {p.pk: i for i, p in enumerate(cited)}
    products.sort(key=lambda p: order.get(p.pk, 99))

    ChatMessage.objects.create(
        session=session,
        role=ChatMessage.Role.ASSISTANT,
        content=reply,
        product_ids=[str(p.pk) for p in products],
        retrieval_meta=meta,
    )

    # First question doubles as the session title, for the history list.
    updates = ["message_count", "updated_at"]
    session.message_count = session.messages.count()
    if not session.title:
        session.title = question[:140]
        updates.append("title")
    session.save(update_fields=updates)

    return reply, products, meta


def search_only(question):
    """Retrieval without the LLM, for when AI is unconfigured or down."""
    products, meta = retrieve(question)
    return products, meta
