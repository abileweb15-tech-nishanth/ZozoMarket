from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]
_DEFAULT_SECRET = "change-me-in-production-please-32+chars"  # noqa: S105


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application ---
    APP_NAME: str = "ZozoMarket API"
    ENVIRONMENT: Literal["development", "test", "staging", "production"] = "development"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    API_V1_PREFIX: str = "/api/v1"
    # Absolute public URL of this API; used to build tracking, unsubscribe and media links.
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # --- Security ---
    SECRET_KEY: SecretStr = SecretStr(_DEFAULT_SECRET)
    ACCESS_TOKEN_MINUTES: int = 60
    REFRESH_TOKEN_DAYS: int = 14
    # Optional service keys. The dashboard signs in with a JWT; an empty list does not
    # open the management API.
    API_KEYS: Annotated[list[str], NoDecode] = Field(default_factory=list)
    WEBHOOK_SECRET: SecretStr | None = None

    # --- CORS ---
    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://postgres:root@127.0.0.1:5432/zozomarket"
    DATABASE_ECHO: bool = False
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    # Production applies schema with `alembic upgrade head` and starts with an empty database.
    AUTO_CREATE_TABLES: bool = False
    SEED_DEMO_DATA: bool = False

    # --- Background work ---
    TASK_BACKEND: Literal["inline", "celery"] = "inline"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"
    # In "inline" mode the API process polls for due campaigns/automation steps.
    SCHEDULER_ENABLED: bool = True
    SCHEDULER_INTERVAL_SECONDS: int = 30
    SEND_BATCH_SIZE: int = 200

    # --- Email delivery ---
    EMAIL_PROVIDER: Literal["console", "smtp", "resend", "mailtrap"] = "console"
    EMAIL_FROM_ADDRESS: str = "hello@zozomarket.local"
    EMAIL_FROM_NAME: str = "ZozoMarket"
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: SecretStr | None = None
    SMTP_USE_TLS: bool = True
    MAILTRAP_API_TOKEN: SecretStr | None = None
    MAILTRAP_ACCOUNT_ID: int | None = None
    MAILTRAP_SENDER_EMAIL: str = "hello@demomailtrap.co"
    MAILTRAP_SENDER_NAME: str = "Mailtrap Test"
    MAILTRAP_CATEGORY: str = "Integration Test"
    RESEND_API_KEY: SecretStr | None = None
    EMAIL_TRACKING_ENABLED: bool = True

    # --- Media ---
    MEDIA_ROOT: Path = BASE_DIR / "storage" / "media"
    MEDIA_URL_PATH: str = "/media"
    MEDIA_MAX_UPLOAD_MB: int = 50

    @field_validator("API_KEYS", "CORS_ORIGINS", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("DATABASE_URL")
    @classmethod
    def _async_driver(cls, value: str) -> str:
        # Accept plain URLs from hosting providers and coerce them to async drivers.
        if value.startswith("postgres://"):
            value = "postgresql://" + value.removeprefix("postgres://")
        if value.startswith("postgresql://"):
            value = "postgresql+asyncpg://" + value.removeprefix("postgresql://")
        if value.startswith("sqlite:///"):
            value = "sqlite+aiosqlite:///" + value.removeprefix("sqlite:///")
        if value.startswith("mysql://"):
            value = "mysql+asyncmy://" + value.removeprefix("mysql://")
        return value

    @model_validator(mode="after")
    def _production_guards(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY.get_secret_value() == _DEFAULT_SECRET:
                raise ValueError("SECRET_KEY must be set in production")
            if self.SEED_DEMO_DATA:
                raise ValueError("SEED_DEMO_DATA must be false in production")
            if self.AUTO_CREATE_TABLES:
                raise ValueError("AUTO_CREATE_TABLES must be false in production")
            if "localhost" in self.PUBLIC_BASE_URL or "127.0.0.1" in self.PUBLIC_BASE_URL:
                raise ValueError("PUBLIC_BASE_URL must be the public API address in production")
        return self

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")

    @property
    def auth_enabled(self) -> bool:
        return bool(self.API_KEYS)

    @property
    def media_max_upload_bytes(self) -> int:
        return self.MEDIA_MAX_UPLOAD_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
