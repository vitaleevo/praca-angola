"""
Product Recommendation Engine – PUVO AI Worker
Supports: trending, collaborative filtering, content-based, and AI-personalized recommendations.
"""

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import hashlib
import time

from src.config import settings

router = APIRouter(prefix="/v1/recommendations", tags=["recommendations"])


def _verify_secret(secret: Optional[str]):
    if secret != settings.ai_internal_secret:
        raise HTTPException(status_code=403, detail="Forbidden")


class RecommendationRequest(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    current_listing_id: Optional[str] = None
    category_slug: Optional[str] = None
    province: Optional[str] = "Luanda"
    browsing_history: list[dict] = []     # [{listing_id, event_type, category_slug}]
    purchased_listing_ids: list[str] = []
    limit: int = 12
    algorithm: str = "auto"               # 'auto', 'trending', 'collaborative', 'content_based', 'ai_personalized'


class RecommendedItem(BaseModel):
    listing_id: str
    score: float
    algorithm: str
    reason: str


class RecommendationResponse(BaseModel):
    recommendations: list[RecommendedItem]
    algorithm_used: str
    computation_time_ms: int


@router.post("/generate", response_model=RecommendationResponse)
async def generate_recommendations(
    req: RecommendationRequest,
    x_ai_internal_secret: Optional[str] = Header(None),
):
    _verify_secret(x_ai_internal_secret)
    start = time.time()

    recommendations: list[RecommendedItem] = []
    algorithm_used = req.algorithm

    if req.algorithm == "auto":
        # Choose best algorithm based on available data
        if req.browsing_history and len(req.browsing_history) >= 3:
            algorithm_used = "content_based"
        elif req.current_listing_id:
            algorithm_used = "collaborative"
        else:
            algorithm_used = "trending"

    if algorithm_used == "trending":
        recommendations = _generate_trending(req)
    elif algorithm_used == "collaborative":
        recommendations = _generate_collaborative(req)
    elif algorithm_used == "content_based":
        recommendations = _generate_content_based(req)
    elif algorithm_used == "ai_personalized":
        recommendations = await _generate_ai_personalized(req)

    elapsed_ms = int((time.time() - start) * 1000)

    return RecommendationResponse(
        recommendations=recommendations[:req.limit],
        algorithm_used=algorithm_used,
        computation_time_ms=elapsed_ms,
    )


def _generate_trending(req: RecommendationRequest) -> list[RecommendedItem]:
    """
    Trending algorithm: returns items scored by a deterministic hash
    to simulate popularity ranking. In production, this would query
    actual view/purchase counts from the database.
    """
    items = []
    # Generate deterministic trending IDs based on current hour (rotates every hour)
    hour_seed = int(time.time()) // 3600
    province = req.province or "Luanda"

    for i in range(req.limit * 2):
        seed = f"trending-{hour_seed}-{province}-{i}"
        item_hash = hashlib.md5(seed.encode()).hexdigest()
        score = 1.0 - (i * 0.05)

        items.append(RecommendedItem(
            listing_id=f"trending-{item_hash[:12]}",
            score=max(score, 0.1),
            algorithm="trending",
            reason=f"Popular em {province} agora",
        ))

    return items[:req.limit]


def _generate_collaborative(req: RecommendationRequest) -> list[RecommendedItem]:
    """
    Collaborative filtering: finds items similar users also viewed/purchased.
    Simplified version — in production uses matrix factorization or embedding similarity.
    """
    items = []
    base_id = req.current_listing_id or "default"

    # Exclude already purchased
    purchased_set = set(req.purchased_listing_ids)

    for i in range(req.limit * 2):
        seed = f"collab-{base_id}-{i}"
        item_hash = hashlib.md5(seed.encode()).hexdigest()
        fake_id = f"rec-{item_hash[:12]}"

        if fake_id in purchased_set:
            continue

        score = 0.95 - (i * 0.04)
        items.append(RecommendedItem(
            listing_id=fake_id,
            score=max(score, 0.1),
            algorithm="collaborative",
            reason="Utilizadores semelhantes também compraram",
        ))

    return items[:req.limit]


def _generate_content_based(req: RecommendationRequest) -> list[RecommendedItem]:
    """
    Content-based: recommends items in similar categories to browsing history.
    """
    # Extract category preferences
    category_counts: dict[str, int] = {}
    for event in req.browsing_history:
        cat = event.get("category_slug", "outros")
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # Sort by frequency
    preferred_categories = sorted(category_counts.items(), key=lambda x: -x[1])
    items = []

    for cat, count in preferred_categories:
        weight = count / max(len(req.browsing_history), 1)
        for i in range(min(req.limit, 6)):
            seed = f"content-{cat}-{i}"
            item_hash = hashlib.md5(seed.encode()).hexdigest()
            score = weight * (0.95 - i * 0.05)

            items.append(RecommendedItem(
                listing_id=f"cb-{item_hash[:12]}",
                score=max(score, 0.1),
                algorithm="content_based",
                reason=f"Baseado no teu interesse em {cat}",
            ))

    # Sort by score
    items.sort(key=lambda x: -x.score)
    return items[:req.limit]


async def _generate_ai_personalized(req: RecommendationRequest) -> list[RecommendedItem]:
    """
    AI-personalized: uses LLM to generate tailored recommendations.
    In production, this would call the LLM gateway with user profile context.
    """
    items = []
    user_seed = req.user_id or req.session_id or "anon"

    for i in range(req.limit):
        seed = f"ai-{user_seed}-{i}-{int(time.time()) // 86400}"
        item_hash = hashlib.md5(seed.encode()).hexdigest()
        score = 0.98 - (i * 0.03)

        reasons = [
            "Escolhido pela IA com base no teu perfil",
            "Recomendação personalizada para ti",
            "Produto que combina com as tuas compras anteriores",
            "Sugestão inteligente baseada nas tuas preferências",
        ]

        items.append(RecommendedItem(
            listing_id=f"ai-{item_hash[:12]}",
            score=max(score, 0.2),
            algorithm="ai_personalized",
            reason=reasons[i % len(reasons)],
        ))

    return items[:req.limit]


class TrackEventRequest(BaseModel):
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    listing_id: str
    event_type: str     # 'view', 'add_to_cart', 'purchase', 'wishlist', 'search'
    category_slug: Optional[str] = None
    search_query: Optional[str] = None
    metadata: dict = {}


@router.post("/track-event")
async def track_browsing_event(
    req: TrackEventRequest,
    x_ai_internal_secret: Optional[str] = Header(None),
):
    """Track user browsing events for the recommendation engine."""
    _verify_secret(x_ai_internal_secret)

    # In production, this would write to a time-series database or event queue
    # For now, we acknowledge the event for the NestJS backend to store in PostgreSQL
    return {
        "tracked": True,
        "event_type": req.event_type,
        "listing_id": req.listing_id,
        "user_id": req.user_id,
        "timestamp": int(time.time()),
    }
