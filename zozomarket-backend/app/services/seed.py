"""Demo records are not inserted. A new workspace starts empty."""

from sqlalchemy.ext.asyncio import AsyncSession


async def seed_demo_data(session: AsyncSession) -> bool:
    return False
