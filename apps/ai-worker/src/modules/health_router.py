import time
from fastapi import APIRouter
from src.config import settings

router = APIRouter(tags=["Health"])
START_TIME = time.time()


@router.get("/health")
@router.get("/v1/health")
async def health():
    return {
        "status": "ok",
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
        "uptime_seconds": int(time.time() - START_TIME),
    }
