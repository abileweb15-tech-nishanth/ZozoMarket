from fastapi import APIRouter

from app.schemas.ai import (
    EmailDraft,
    EmailDraftRequest,
    PreheaderRequest,
    Section,
    SubjectLineRequest,
    TextSuggestions,
)
from app.schemas.common import ApiResponse
from app.services import ai_service

router = APIRouter(prefix="/ai", tags=["AI Copywriter"])


@router.post("/generate", response_model=ApiResponse[EmailDraft])
async def generate_email(body: EmailDraftRequest):
    """Full email draft as labelled sections (subject lines, preview text, headline, body,
    CTA) — the shape rendered by the AI Assistant page."""
    result = await ai_service.generate_email(body)
    sections = [Section(label=s["label"], value=s["value"]) for s in result.data["sections"]]
    return ApiResponse(
        data=EmailDraft(sections=sections, provider=result.provider, model=result.model)
    )


@router.post("/subject-lines", response_model=ApiResponse[TextSuggestions])
async def subject_lines(body: SubjectLineRequest):
    result = await ai_service.subject_lines(body)
    return ApiResponse(
        data=TextSuggestions(
            suggestions=result.data["suggestions"], provider=result.provider, model=result.model
        )
    )


@router.post("/preheaders", response_model=ApiResponse[TextSuggestions])
async def preheaders(body: PreheaderRequest):
    result = await ai_service.preheaders(body)
    return ApiResponse(
        data=TextSuggestions(
            suggestions=result.data["suggestions"], provider=result.provider, model=result.model
        )
    )
