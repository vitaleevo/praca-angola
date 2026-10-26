from fastapi import Header, HTTPException, status
from src.config import settings


async def verify_internal_secret(
    x_ai_internal_secret: str = Header(None, alias="X-AI-Internal-Secret")
) -> bool:
    """Verifies that incoming requests originate from authorized internal services (NestJS API)."""
    if not settings.ai_internal_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "AI_SECRET_NOT_CONFIGURED", "message": "Internal AI authentication is not configured."},
        )

    if not x_ai_internal_secret or x_ai_internal_secret != settings.ai_internal_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED_AI_REQUEST", "message": "Invalid or missing internal secret."},
        )
    return True
