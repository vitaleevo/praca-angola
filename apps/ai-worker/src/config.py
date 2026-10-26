from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "puvo-ai-worker"
    version: str = "1.0.0"
    environment: str = "development"
    debug: bool = False
    
    # Security
    ai_internal_secret: str = ""
    
    # Service URLs
    redis_url: str = "redis://redis:6379"
    database_url: str = "postgresql://praca:praca_local_dev@postgres:5432/praca_angola"
    
    # AI Providers (optional, for LLM fallbacks/advanced tasks)
    gemini_api_key: str = ""
    openai_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
