"""AI email copywriter: prompt construction, LLM clients and a deterministic mock fallback."""

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.core.config import settings
from app.core.exceptions import ExternalServiceError
from app.schemas.ai import EmailDraftRequest, PreheaderRequest, SubjectLineRequest

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a senior email marketing copywriter. You write concise, high-converting, "
    "brand-safe email copy that respects anti-spam best practices: no ALL CAPS subject lines, "
    "no misleading claims, no excessive punctuation or spam trigger words. Use the merge tag "
    "{{first_name}} for personalisation where natural. Always reply with a single JSON object "
    "and nothing else."
)

FORMAT_SECTIONS: dict[str, list[str]] = {
    "Newsletter": ["Subject lines", "Preview text", "Headline", "Body", "Call to action"],
    "Promotional": [
        "Subject lines",
        "Pre-header text",
        "Headline banner",
        "Promotional body",
        "Primary CTA button",
    ],
    "Welcome Sequence": [
        "Welcome subject lines",
        "Preview text",
        "Welcome header",
        "Welcome message",
        "Onboarding steps",
    ],
    "Announcement": [
        "Announcement subject lines",
        "Preview text",
        "Headline",
        "Announcement body",
        "Call to action",
    ],
}


@dataclass(slots=True)
class Completion:
    data: dict[str, Any]
    provider: str
    model: str


class LLMClient(Protocol):
    provider: str
    model: str

    async def complete_json(self, system: str, user: str) -> dict[str, Any]: ...


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object in model output")
    data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("Model output is not a JSON object")
    return data


class OpenAIClient:
    provider = "openai"

    def __init__(self) -> None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        self.model = settings.OPENAI_MODEL
        self._headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY.get_secret_value()}"}

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{settings.OPENAI_BASE_URL}/chat/completions",
                headers=self._headers,
                json={
                    "model": self.model,
                    "temperature": 0.8,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
        resp.raise_for_status()
        return _extract_json(resp.json()["choices"][0]["message"]["content"])


class AnthropicClient:
    provider = "anthropic"

    def __init__(self) -> None:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is not configured")
        self.model = settings.ANTHROPIC_MODEL
        self._headers = {
            "x-api-key": settings.ANTHROPIC_API_KEY.get_secret_value(),
            "anthropic-version": "2023-06-01",
        }

    async def complete_json(self, system: str, user: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{settings.ANTHROPIC_BASE_URL}/messages",
                headers=self._headers,
                json={
                    "model": self.model,
                    "max_tokens": 1500,
                    "temperature": 0.8,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
        resp.raise_for_status()
        blocks = resp.json().get("content", [])
        return _extract_json("".join(b.get("text", "") for b in blocks if b.get("type") == "text"))


def _client() -> LLMClient | None:
    if settings.AI_PROVIDER == "openai":
        return OpenAIClient()
    if settings.AI_PROVIDER == "anthropic":
        return AnthropicClient()
    return None


async def _complete(system: str, user: str, mock: dict[str, Any]) -> Completion:
    try:
        client = _client()
    except RuntimeError as exc:
        if not settings.AI_FALLBACK_TO_MOCK:
            raise ExternalServiceError(str(exc), code="ai_not_configured") from exc
        logger.warning("AI provider misconfigured (%s); using mock", exc)
        client = None
    if client is None:
        return Completion(mock, "mock", "zozomarket-template-v1")
    try:
        return Completion(await client.complete_json(system, user), client.provider, client.model)
    except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError) as exc:
        logger.warning("AI provider %s failed: %s", client.provider, exc)
        if settings.AI_FALLBACK_TO_MOCK:
            return Completion(mock, "mock", "zozomarket-template-v1")
        raise ExternalServiceError("AI provider request failed", code="ai_unavailable") from exc


def _brief(req: Any) -> str:
    return (
        f"Goal: {req.goal}\nProduct/offer: {req.product or 'n/a'}\n"
        f"Audience: {req.audience or 'general subscribers'}\nTone: {req.tone}\n"
        f"Language: {req.language}"
    )


def _strings(data: dict[str, Any], key: str, fallback: list[str], count: int) -> list[str]:
    values = data.get(key)
    if not isinstance(values, list):
        return fallback[:count]
    cleaned = [str(v).strip() for v in values if str(v).strip()]
    return (cleaned or fallback)[:count]


# --- Public API ---------------------------------------------------------------------------


async def generate_email(req: EmailDraftRequest) -> Completion:
    labels = FORMAT_SECTIONS[req.format]
    user = (
        f"Write a {req.format} email.\n{_brief(req)}\nVariation seed: {req.variant}\n\n"
        f'Return JSON: {{"sections": [{{"label": str, "value": str}}, ...]}} with exactly these '
        f"labels in order: {json.dumps(labels)}. Subject-line sections contain 3 numbered "
        "options separated by newlines. Body sections are 60-140 words."
    )
    mock = {"sections": mock_email(req)}
    completion = await _complete(SYSTEM_PROMPT, user, mock)
    sections = completion.data.get("sections")
    valid = isinstance(sections, list) and all(
        isinstance(s, dict) and s.get("label") and isinstance(s.get("value"), str) for s in sections
    )
    if not valid:
        logger.warning("AI returned malformed sections; using mock output")
        return Completion(mock, "mock", "zozomarket-template-v1")
    return completion


async def subject_lines(req: SubjectLineRequest) -> Completion:
    user = (
        f"Write {req.count} distinct email subject lines (max 60 characters each).\n{_brief(req)}"
        '\n\nReturn JSON: {"suggestions": [str, ...]}'
    )
    fallback = mock_subject_lines(req)
    completion = await _complete(SYSTEM_PROMPT, user, {"suggestions": fallback})
    completion.data = {"suggestions": _strings(completion.data, "suggestions", fallback, req.count)}
    return completion


async def preheaders(req: PreheaderRequest) -> Completion:
    user = (
        f"Write {req.count} inbox preview (preheader) texts, 40-100 characters, that complement "
        f"the subject line {req.subject!r} without repeating it.\n{_brief(req)}"
        '\n\nReturn JSON: {"suggestions": [str, ...]}'
    )
    fallback = mock_preheaders(req)
    completion = await _complete(SYSTEM_PROMPT, user, {"suggestions": fallback})
    completion.data = {"suggestions": _strings(completion.data, "suggestions", fallback, req.count)}
    return completion


# --- Mock generator (offline / fallback) ----------------------------------------------------


def _ctx(req: Any) -> tuple[str, str, str]:
    product = req.product or "our latest collection"
    audience = req.audience or "our subscribers"
    return product, audience, req.goal.rstrip(".")


def mock_subject_lines(req: SubjectLineRequest) -> list[str]:
    p, a, _ = _ctx(req)
    options = [
        f"{{{{first_name}}}}, meet {p}",
        f"Made for {a}: {p}",
        f"Your first look at {p}",
        f"Inside: what's new with {p}",
        f"A little something for {a}",
        f"Don't miss {p} this week",
        f"We think you'll love {p}",
        f"Fresh from us: {p}",
        f"The {p} edit, picked for you",
        f"Quick question about {p}",
    ]
    return options[: req.count]


def mock_preheaders(req: PreheaderRequest) -> list[str]:
    p, a, goal = _ctx(req)
    options = [
        f"Everything {a} need to know about {p} in one quick read.",
        f"{goal.capitalize()} — here's how to get started today.",
        f"Open for an exclusive perk on {p}, just for you.",
        f"Two minutes, three ideas, and one great reason to try {p}.",
        f"Your inbox just got a little better: {p} is here.",
    ]
    return options[: req.count]


def mock_email(req: EmailDraftRequest) -> list[dict[str, str]]:
    p, a, goal = _ctx(req)
    alt = req.variant % 2 == 1
    labels = FORMAT_SECTIONS[req.format]
    if req.format == "Promotional":
        values = [
            f"1. Exclusive for {a}: savings on {p}\n2. 48 hours only: {p}\n3. Your VIP pass inside"
            if not alt
            else f"1. Flash sale: {p}\n2. Just for you, {{{{first_name}}}}\n3. Ending soon: {p}",
            f"Claim your member discount on {p} before midnight.",
            f"Special savings on {p}" if not alt else f"An exclusive treat for {a}",
            f"Hello {{{{first_name}}}},\n\nFor a limited time, enjoy an exclusive perk on {p}. "
            f"We made sure {a} get the best value.\n\nUse code ZOZOVIP at checkout. "
            "Offer ends Sunday at midnight.",
            "Shop the sale now",
        ]
    elif req.format == "Welcome Sequence":
        values = [
            f"1. Welcome to the family, {{{{first_name}}}}\n2. You're in! Here's what's next\n"
            f"3. Getting started with {p}",
            "Thanks for subscribing — a welcome gift is waiting inside.",
            "You're officially in, {{first_name}}!",
            f"Hi {{{{first_name}}}},\n\nThank you for joining us. Expect helpful guides, early "
            f"access, and the best of {p}.\n\nAs a thank you, enjoy 15% off your first order "
            "with code WELCOME15.\n\nCheers,\nThe team",
            "1. Complete your profile\n2. Browse popular picks\n3. Join our loyalty program",
        ]
    elif req.format == "Announcement":
        values = [
            f"1. Introducing {p}\n2. Big news for {a}\n3. It's finally here",
            f"Discover everything new about {p} and what it means for you.",
            f"Introducing {p}",
            f"Dear {{{{first_name}}}},\n\nWe've been working on something special and are "
            f"thrilled to unveil {p}. Built for {a}, it brings the features you asked for most."
            "\n\nRead on for all the details.",
            "Explore what's new",
        ]
    else:
        values = [
            f"1. This month: {p}\n2. Stories and tips for {a}\n3. What we're loving right now"
            if not alt
            else f"1. {{{{first_name}}}}, your monthly roundup\n2. New: {p}\n3. Fresh ideas inside",
            f"{goal.capitalize()} — plus tips, stories and a little extra.",
            f"What's new: {p}",
            f"Hi {{{{first_name}}}},\n\nHere's what's been happening. This month we're "
            f"spotlighting {p}, hand-picked for {a}.\n\nYou'll also find our favourite tips and "
            "a few stories from the community.",
            "Read the full newsletter",
        ]
    return [{"label": label, "value": value} for label, value in zip(labels, values, strict=True)]
