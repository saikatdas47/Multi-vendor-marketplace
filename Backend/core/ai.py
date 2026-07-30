"""Groq LLM access, deliberately frugal with tokens.

Cost control, in order of impact:

1. Nothing is sent that the model doesn't need. Prompts carry short field
   summaries, not whole serialized objects.
2. Every call is capped by ``max_tokens`` and asked for a hard length limit.
3. Identical inputs hit a cache keyed on a hash of the prompt, so repeated
   requests for the same product cost nothing.
4. ``reasoning_effort`` is opt-in via ``GROQ_REASONING_EFFORT``. On a reasoning
   model, "low" avoids paying for hidden thinking on short copywriting tasks;
   on a model that doesn't support the parameter, sending it is a 400, so the
   default is to omit it.
5. Callers pass a per-request token ceiling; nobody gets the default 2048.

If ``GROQ_API_KEY`` is unset the whole module degrades to a clean
``AIUnavailable``, so the app runs fine with no AI configured at all.
"""

import hashlib
import json
import logging
import re

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

try:
    from groq import Groq
except ImportError:  # pragma: no cover
    Groq = None


class AIUnavailable(Exception):
    """AI is not configured, or the provider failed."""



# The Groq SDK renamed `max_tokens` to `max_completion_tokens` partway through
# the 0.x line. Rather than pinning a version, probe the installed signature
# once and use whichever name it accepts — a portfolio project shouldn't break
# because someone ran `pip install -U groq`.
_TOKEN_KWARG = None


def _token_kwarg():
    global _TOKEN_KWARG
    if _TOKEN_KWARG is None:
        try:
            import inspect

            from groq.resources.chat.completions import Completions

            params = inspect.signature(Completions.create).parameters
            _TOKEN_KWARG = (
                "max_completion_tokens"
                if "max_completion_tokens" in params
                else "max_tokens"
            )
        except Exception:
            # Older SDKs and any import failure: `max_tokens` is the safe default,
            # since it has been accepted for the whole 0.x line.
            _TOKEN_KWARG = "max_tokens"
    return _TOKEN_KWARG


def _request_kwargs(messages, *, max_tokens, temperature):
    kwargs = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
        "top_p": 1,
        "stream": False,
        _token_kwarg(): max_tokens,
    }
    # `reasoning_effort` only exists on reasoning-capable models. Sending it to
    # one that doesn't support it is a 400, so it's opt-in via .env.
    if settings.GROQ_REASONING_EFFORT:
        kwargs["reasoning_effort"] = settings.GROQ_REASONING_EFFORT
    return kwargs


_client = None


def get_client():
    global _client
    if not settings.AI_ENABLED:
        raise AIUnavailable("AI features are not configured on this server.")
    if Groq is None:
        raise AIUnavailable("The groq package is not installed.")
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY, timeout=settings.GROQ_TIMEOUT)
    return _client


def _cache_key(prefix, payload):
    digest = hashlib.sha256(payload.encode()).hexdigest()[:32]
    return f"ai:{prefix}:{digest}"


def complete(
    system,
    user,
    *,
    cache_prefix=None,
    cache_ttl=None,
    max_tokens=None,
    temperature=0.6,
):
    """One non-streaming completion. Returns stripped text.

    Streaming is intentionally not used: these responses are short and are
    consumed as a whole, so streaming would add complexity for no benefit.
    """
    max_tokens = max_tokens or settings.GROQ_MAX_TOKENS
    cache_ttl = cache_ttl if cache_ttl is not None else settings.AI_SUMMARY_CACHE_TTL

    key = _cache_key(cache_prefix, f"{system}\n{user}\n{max_tokens}") if cache_prefix else None
    if key:
        cached = cache.get(key)
        if cached is not None:
            return cached

    client = get_client()
    try:
        response = client.chat.completions.create(
            **_request_kwargs(
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                max_tokens=max_tokens,
                temperature=temperature,
            )
        )
    except Exception as exc:
        logger.warning("Groq call failed: %s", exc)
        raise AIUnavailable("The AI service is temporarily unavailable.") from exc

    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise AIUnavailable("The AI service returned an empty response.")

    if key:
        cache.set(key, text, cache_ttl)
    return text


def chat(messages, *, max_tokens=None, temperature=0.4):
    """Multi-turn completion. `messages` is a list of {role, content}.

    Not cached: a conversation's meaning depends on its history, so a cache key
    would have to include the whole transcript and would almost never hit.
    """
    client = get_client()
    try:
        response = client.chat.completions.create(
            **_request_kwargs(
                messages,
                max_tokens=max_tokens or settings.GROQ_MAX_TOKENS,
                temperature=temperature,
            )
        )
    except Exception as exc:
        logger.warning("Groq chat call failed: %s", exc)
        raise AIUnavailable("The AI service is temporarily unavailable.") from exc

    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise AIUnavailable("The AI service returned an empty response.")
    return text


def complete_json(system, user, *, max_tokens=None, temperature=0.4, cache_prefix=None,
                  cache_ttl=None):
    """Like `complete`, but parses the reply as JSON.

    LLMs wrap JSON in prose or fences even when told not to, so the response is
    salvaged by extracting the outermost braces before parsing. Raising
    AIUnavailable on failure keeps callers from having to handle malformed
    output separately from an outage - both mean "no usable result".
    """
    raw = complete(
        system + "\n\nRespond with a single valid JSON object and nothing else.",
        user,
        max_tokens=max_tokens,
        temperature=temperature,
        cache_prefix=cache_prefix,
        cache_ttl=cache_ttl,
    )

    candidate = raw.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*\n?|\n?```$", "", candidate).strip()

    start, end = candidate.find("{"), candidate.rfind("}")
    if start != -1 and end > start:
        candidate = candidate[start : end + 1]

    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        logger.warning("AI returned unparseable JSON: %s", raw[:300])
        raise AIUnavailable("The AI service returned an unreadable response.") from exc


# --------------------------------------------------------------- prompts

DESCRIPTION_SYSTEM = (
    "You are a senior e-commerce copywriter. You write listing content that is "
    "concrete and factual.\n"
    "Hard rules:\n"
    "- Use ONLY the facts given. Never invent specifications, materials, "
    "certifications, measurements, battery life or compatibility.\n"
    "- Never mention price, discounts, shipping or stock.\n"
    "- No marketing clichés ('game-changing', 'revolutionary', 'unleash').\n"
    "Return this exact JSON shape:\n"
    '{"seo_title": str, "description": str, "bullets": [str], '
    '"meta_description": str}\n'
    "seo_title: under 60 characters, includes the product name.\n"
    "description: 2 short paragraphs, under 120 words total.\n"
    "bullets: 3-5 items, each under 12 words, benefit-led.\n"
    "meta_description: under 155 characters, one sentence."
)


def draft_product_listing(
    *, name, category, brand="", features="", short_description="", tone="professional"
):
    """Full listing content as a validated dict.

    Returns seo_title / description / bullets / meta_description. Requesting all
    four in one call rather than four separate calls is the single biggest cost
    saving here: the product facts are sent once instead of four times.
    """
    facts = [f"Product name: {name}", f"Category: {category}"]
    if brand:
        facts.append(f"Brand: {brand[:80]}")
    if features:
        facts.append(f"Features: {features[:400]}")
    if short_description:
        facts.append(f"Existing summary: {short_description[:200]}")

    data = complete_json(
        DESCRIPTION_SYSTEM,
        "\n".join(facts) + f"\n\nTone: {tone}.",
        cache_prefix="listing",
        cache_ttl=settings.AI_DESCRIPTION_CACHE_TTL,
        max_tokens=settings.AI_DESCRIPTION_MAX_TOKENS,
        temperature=0.7,
    )

    # Normalise defensively — the model can omit a key or return a string where
    # a list belongs, and the seller UI must never receive a broken shape.
    bullets = data.get("bullets") or []
    if isinstance(bullets, str):
        bullets = [line.strip(" -•") for line in bullets.splitlines() if line.strip()]

    result = {
        "seo_title": str(data.get("seo_title") or name)[:70],
        "description": str(data.get("description") or "").strip(),
        "bullets": [str(b).strip() for b in bullets if str(b).strip()][:5],
        "meta_description": str(data.get("meta_description") or "").strip()[:160],
    }
    if not result["description"]:
        raise AIUnavailable("The AI service returned no description.")
    return result


SUMMARY_SYSTEM = (
    "You summarise customer reviews for shoppers. Return 2-3 sentences of plain "
    "text: no preamble, headings, or bullet points. State what reviewers "
    "consistently praise and any recurring complaint. Use only the reviews given."
)


def summarise_reviews(*, product_name, reviews):
    """`reviews` is a list of (rating, comment). Truncated hard before sending."""
    if len(reviews) < 3:
        raise AIUnavailable("Not enough reviews to summarise yet.")

    # Cap both the number of reviews and each comment's length: this is the
    # single biggest lever on cost for a product with hundreds of reviews.
    # Both caps live in .env so they can be tuned without a deploy.
    max_reviews = settings.AI_SUMMARY_MAX_REVIEWS
    max_chars = settings.AI_SUMMARY_COMMENT_CHARS

    lines = [
        f"{rating}/5: {(comment or '').strip()[:max_chars]}"
        for rating, comment in reviews[:max_reviews]
        if comment and comment.strip()
    ]
    if len(lines) < 3:
        raise AIUnavailable("Not enough written reviews to summarise yet.")

    return complete(
        SUMMARY_SYSTEM,
        f"Product: {product_name}\n\nReviews:\n" + "\n".join(lines),
        cache_prefix="revsum",
        cache_ttl=settings.AI_SUMMARY_CACHE_TTL,
        max_tokens=settings.AI_SUMMARY_MAX_TOKENS,
        temperature=0.3,
    )
