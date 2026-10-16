from fastapi import APIRouter, Depends

from app.api.deps import require_api_key
from app.api.v1.endpoints import (
    ai,
    analytics,
    automations,
    calendar,
    campaigns,
    contacts,
    dashboard,
    forms,
    media,
    templates,
    tracking,
)

# Authenticated management API (used by the ZozoMarket dashboard).
private_router = APIRouter(dependencies=[Depends(require_api_key)])
for module in (
    dashboard,
    campaigns,
    automations,
    contacts,
    calendar,
    templates,
    forms,
    media,
    analytics,
    ai,
):
    private_router.include_router(module.router)

api_router = APIRouter()
api_router.include_router(private_router)
# Public endpoints: embedded forms, email tracking links, provider webhooks (own auth).
api_router.include_router(forms.public_router)
api_router.include_router(tracking.router)
api_router.include_router(tracking.webhook_router)
