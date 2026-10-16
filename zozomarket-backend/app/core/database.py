from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import MetaData, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

from app.core.config import settings

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _engine_kwargs(url: str) -> dict[str, Any]:
    if url.startswith("sqlite"):
        kwargs: dict[str, Any] = {"connect_args": {"check_same_thread": False}}
        if ":memory:" in url or url.rstrip("/").endswith("sqlite+aiosqlite:"):
            kwargs["poolclass"] = StaticPool
        return kwargs
    return {
        "pool_size": settings.DATABASE_POOL_SIZE,
        "max_overflow": settings.DATABASE_MAX_OVERFLOW,
        "pool_pre_ping": True,
    }


def _configure_sqlite(engine: AsyncEngine, *, immediate: bool) -> None:
    # Take over transaction control from the sqlite3 driver so SAVEPOINTs work
    # (https://docs.sqlalchemy.org/en/20/dialects/sqlite.html#serializable-isolation-savepoints-transactional-ddl).
    # BEGIN IMMEDIATE makes concurrent writers (API + scheduler + dispatches) queue on
    # busy_timeout; a deferred BEGIN fails instantly when a stale reader tries to write.
    begin = "BEGIN IMMEDIATE" if immediate else "BEGIN"

    @event.listens_for(engine.sync_engine, "connect")
    def _on_connect(dbapi_conn, _record) -> None:
        dbapi_conn.isolation_level = None
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        # WAL lets readers proceed while the scheduler/background tasks write.
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    @event.listens_for(engine.sync_engine, "begin")
    def _on_begin(conn) -> None:
        conn.exec_driver_sql(begin)


def create_engine(url: str, *, sqlite_immediate: bool = True) -> AsyncEngine:
    engine = create_async_engine(url, echo=settings.DATABASE_ECHO, **_engine_kwargs(url))
    if url.startswith("sqlite"):
        _configure_sqlite(engine, immediate=sqlite_immediate)
    return engine


engine: AsyncEngine = create_engine(settings.DATABASE_URL)
SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, expire_on_commit=False, autoflush=False
)


def configure_database(url: str) -> None:
    """Rebind the global engine/sessionmaker (used by tests and worker processes)."""
    global engine
    engine = create_engine(url)
    SessionLocal.configure(bind=engine)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def create_all() -> None:
    import app.models  # noqa: F401  (register mappers)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
