"""Catalogue retrieval for the shopping assistant.

This is the half of the feature that does **not** use the LLM, and it is
deliberately the larger half.

The naive approach is to hand the whole product table to the model and let it
pick. That hallucinates prices, recommends out-of-stock items, and costs tokens
proportional to catalogue size — so it stops working at exactly the point the
project stops being a toy.

Instead: parse the constraints out of the question with plain Python, let
PostgreSQL do the searching, and give the model only a shortlist. Retrieval is
deterministic, testable, free, and the model's job shrinks to writing prose
about rows we already trust.
"""

import re
from decimal import Decimal

from django.contrib.postgres.search import SearchQuery, SearchRank, SearchVector
from django.db.models import Q

from products.models import Category, Product

# Words that carry no search signal. Left deliberately short — an aggressive
# stopword list starts deleting real product terms ("pro", "air", "max").
STOPWORDS = {
    "a", "an", "and", "any", "are", "best", "buy", "can", "cheap", "do", "does",
    "for", "get", "give", "good", "has", "have", "how", "i", "in", "is", "it",
    "looking", "me", "my", "need", "of", "on", "or", "recommend", "show",
    "something", "suggest", "than", "that", "the", "to", "under", "want", "what",
    "which", "who", "will", "with", "would", "you", "your",
}

# Intent words → the ordering the customer probably meant.
ORDERING_HINTS = [
    (("cheapest", "cheap", "budget", "affordable", "low price"), "price"),
    (("expensive", "premium", "high end", "top of the line"), "-price"),
    (("best", "top rated", "highest rated", "good reviews"), "-avg_rating"),
    (("popular", "trending", "best seller", "bestselling"), "-view_count"),
    (("new", "newest", "latest", "recent"), "-created_at"),
]


def parse_constraints(query):
    """Pulls structured filters out of a natural-language question.

    Handles the phrasings people actually type:
        "under $1000", "below 500", "less than 2000", "cheaper than 300"
        "over $200", "above 150", "at least 100"
        "between 200 and 500", "$200-$500"
        "cheapest", "best rated", "newest"
    """
    text = query.lower()
    constraints = {"min_price": None, "max_price": None, "ordering": None}

    number = r"\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)"

    def to_decimal(raw):
        try:
            return Decimal(raw.replace(",", ""))
        except Exception:
            return None

    # Range first — "between 200 and 500" also matches the "under" patterns, so
    # checking it first prevents a partial parse.
    range_match = re.search(
        rf"(?:between|from)\s+{number}\s*(?:and|to|-|–)\s*{number}", text
    ) or re.search(rf"{number}\s*(?:-|–|to)\s*{number}", text)
    if range_match:
        low, high = to_decimal(range_match.group(1)), to_decimal(range_match.group(2))
        if low is not None and high is not None:
            constraints["min_price"], constraints["max_price"] = sorted([low, high])
    else:
        upper = re.search(
            rf"(?:under|below|less than|cheaper than|max|up to|within|no more than)\s+{number}",
            text,
        )
        if upper:
            constraints["max_price"] = to_decimal(upper.group(1))

        lower = re.search(
            rf"(?:over|above|more than|at least|minimum|starting at|from)\s+{number}", text
        )
        if lower:
            constraints["min_price"] = to_decimal(lower.group(1))

    for words, ordering in ORDERING_HINTS:
        if any(word in text for word in words):
            constraints["ordering"] = ordering
            break

    return constraints


def parse_category(query):
    """Matches the question against real category names.

    Checked longest-name-first so "Gaming Laptops" wins over "Laptops" when both
    exist. Only names actually in the database are considered, so this can never
    invent a category.
    """
    text = query.lower()
    categories = Category.objects.filter(is_active=True).values_list("id", "name")
    matches = [
        (cid, name)
        for cid, name in categories
        if name.lower() in text or name.lower().rstrip("s") in text
    ]
    if not matches:
        return None
    return max(matches, key=lambda pair: len(pair[1]))[0]


def search_terms(query):
    """Strips filler so the full-text query carries only meaningful words."""
    cleaned = re.sub(r"[^\w\s]", " ", query.lower())
    cleaned = re.sub(r"\$?\d[\d,.]*", " ", cleaned)  # prices are handled separately
    words = [w for w in cleaned.split() if w not in STOPWORDS and len(w) > 2]
    return " ".join(words[:8])


def retrieve(query, *, limit=8):
    """Returns (products, meta). Never raises — an empty list is a valid answer."""
    constraints = parse_constraints(query)
    category_id = parse_category(query)
    terms = search_terms(query)

    qs = (
        Product.objects.published()
        .select_related("seller", "category")
        .prefetch_related("images")
        .with_ratings()
    )

    if constraints["min_price"] is not None:
        qs = qs.filter(price__gte=constraints["min_price"])
    if constraints["max_price"] is not None:
        qs = qs.filter(price__lte=constraints["max_price"])
    if category_id:
        category = Category.objects.filter(pk=category_id).first()
        if category:
            qs = qs.filter(category_id__in=category.descendant_ids())

    strategy = "browse"
    if terms:
        vector = (
            SearchVector("name", weight="A")
            + SearchVector("short_description", weight="B")
            + SearchVector("description", weight="C")
            + SearchVector("category__name", weight="B")
        )
        search = SearchQuery(terms, search_type="websearch")
        ranked = qs.annotate(rank=SearchRank(vector, search)).filter(rank__gt=0.01)

        if ranked.exists():
            qs, strategy = ranked.order_by("-rank"), "full_text"
        else:
            # Full-text finds nothing for partial words ("headph"), so fall back
            # to substring matching on any single term before giving up.
            fallback = Q()
            for word in terms.split():
                fallback |= Q(name__icontains=word) | Q(category__name__icontains=word)
            loose = qs.filter(fallback)
            if loose.exists():
                qs, strategy = loose, "substring"

    # An explicit intent ("cheapest") overrides relevance ranking.
    if constraints["ordering"]:
        qs = qs.order_by(constraints["ordering"])
    elif strategy == "browse":
        qs = qs.order_by("-is_featured", "-avg_rating", "-view_count")

    # In-stock items first: recommending something unbuyable wastes the answer.
    products = sorted(qs[: limit * 3], key=lambda p: (p.stock == 0,))[:limit]

    meta = {
        "strategy": strategy,
        "terms": terms,
        "category_id": str(category_id) if category_id else None,
        "min_price": str(constraints["min_price"]) if constraints["min_price"] else None,
        "max_price": str(constraints["max_price"]) if constraints["max_price"] else None,
        "ordering": constraints["ordering"],
        "count": len(products),
    }
    return products, meta


def to_context(products):
    """Compact catalogue block for the prompt.

    One dense line per product instead of serialized JSON: same information,
    roughly a third of the tokens. Numbered so the model can cite [1], [2]
    rather than repeating names back at us.
    """
    lines = []
    for index, product in enumerate(products, start=1):
        bits = [
            f"[{index}] {product.name}",
            f"{product.category.name}",
            f"${product.price}",
        ]
        if product.avg_rating:
            bits.append(f"{round(product.avg_rating, 1)}★({product.review_count})")
        bits.append("in stock" if product.stock > 0 else "OUT OF STOCK")
        bits.append(f"by {product.seller.shop_name if product.seller else 'unknown'}")
        if product.short_description:
            bits.append(product.short_description[:110])
        lines.append(" | ".join(bits))
    return "\n".join(lines)
