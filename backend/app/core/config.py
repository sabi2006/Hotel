from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration, loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    APP_NAME: str = "Hotel Restaurant Billing & Order Management"
    API_PREFIX: str = "/api"
    DEBUG: bool = True

    # --- Mongo ---
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "hotel_billing"

    # --- Auth ---
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12

    # --- CORS ---
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Bootstrap admin (created on first startup when no admin exists) ---
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@myhotel.com"
    BOOTSTRAP_ADMIN_PASSWORD: str = "Admin@123"
    BOOTSTRAP_ADMIN_NAME: str = "Super Admin"

    # When False, only an admin can create staff accounts.
    ALLOW_PUBLIC_STAFF_REGISTRATION: bool = True

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
