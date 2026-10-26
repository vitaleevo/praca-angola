from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.config import settings
from src.modules.health_router import router as health_router
from src.modules.catalog_router import router as catalog_router
from src.modules.moderation_router import router as moderation_router
from src.modules.fraud_router import router as fraud_router
from src.modules.llm_gateway_router import router as llm_gateway_router
from src.modules.recommendations_router import router as recommendations_router
from src.modules.storefront_chat_router import router as storefront_chat_router

app = FastAPI(
    title=settings.service_name,
    version=settings.version,
    description="PUVO AI & Inference Subsystem for catalog assistance, moderation, fraud prevention, semantic matching, recommendations and storefront chatbot.",
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

# CORS configuration (Internal Docker communication)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health_router)
app.include_router(catalog_router)
app.include_router(moderation_router)
app.include_router(fraud_router)
app.include_router(llm_gateway_router)
app.include_router(recommendations_router)
app.include_router(storefront_chat_router)


@app.get("/")
async def root():
    return {
        "service": settings.service_name,
        "version": settings.version,
        "status": "online",
        "documentation": "Internal microservice for PUVO platform",
    }
