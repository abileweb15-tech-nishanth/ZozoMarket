"""Email template storage plus rendering of builder blocks and merge tags.

Merge tags use `{{ name }}` syntax and are substituted with HTML-escaped values via a
regex — deliberately not a template engine, so user content can never execute code.
"""

import html as html_lib
import re
from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.template import EmailTemplate
from app.schemas.template import TemplateCreate, TemplateUpdate
from app.services.query import ilike, paginate

MERGE_TAG = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")
_COLOR = re.compile(r"^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$")
_SAFE_URL = re.compile(r"^(https?://|mailto:|/|\{\{)", re.IGNORECASE)

SAMPLE_VARIABLES: dict[str, str] = {
    "first_name": "Alex",
    "last_name": "Morgan",
    "name": "Alex Morgan",
    "email": "alex@example.com",
    "unsubscribe_url": "#unsubscribe",
    "preferences_url": "#preferences",
}


# --- Merge tags ----------------------------------------------------------------


def render_merge_tags(text: str, variables: Mapping[str, str], *, escape: bool = True) -> str:
    def _sub(match: re.Match[str]) -> str:
        value = variables.get(match.group(1), "")
        return html_lib.escape(value, quote=True) if escape else value

    return MERGE_TAG.sub(_sub, text)


def contact_variables(name: str, email: str, extra: Mapping[str, Any] | None = None) -> dict:
    first, _, last = (name or "").partition(" ")
    variables = {
        "first_name": first or "there",
        "last_name": last,
        "name": name or email,
        "email": email,
    }
    for key, value in (extra or {}).items():
        if isinstance(value, str | int | float):
            variables.setdefault(str(key), str(value))
    return variables


def html_to_text(markup: str) -> str:
    text = re.sub(r"(?is)<(script|style|head).*?</\1>", "", markup)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|h[1-6]|tr|li)>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", "", text)
    text = html_lib.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


# --- Builder blocks → HTML ---------------------------------------------------------


def _color(value: Any, default: str) -> str:
    value = str(value or "")
    return value if _COLOR.match(value) else default


def _url(value: Any) -> str:
    value = str(value or "").strip()
    return html_lib.escape(value, quote=True) if value and _SAFE_URL.match(value) else "#"


def _text(value: Any) -> str:
    return html_lib.escape(str(value or "")).replace("\n", "<br>")


def _block_html(block: Mapping[str, Any]) -> str:
    kind = block.get("type")
    align = block.get("align") if block.get("align") in ("left", "center", "right") else "center"
    size = max(8, min(int(block.get("size") or 15), 96))
    padding = max(
        0, min(int(block.get("padding") if block.get("padding") is not None else 16), 200)
    )
    color = _color(block.get("color"), "#1f2937")
    bg = _color(block.get("bg"), "#ffffff")
    text = _text(block.get("text"))
    cell = (
        f"padding:{padding}px;text-align:{align};color:{color};background-color:{bg};"
        f"font-size:{size}px;font-family:Arial,Helvetica,sans-serif;line-height:1.5;"
    )

    if kind == "spacer":
        return f'<tr><td style="height:{padding}px;line-height:{padding}px;">&nbsp;</td></tr>'
    if kind == "image":
        src = _url(block.get("image"))
        return (
            f'<tr><td style="padding:0;background-color:{bg};">'
            f'<img src="{src}" alt="{text}" width="600" '
            f'style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>'
        )
    if kind == "button":
        return (
            f'<tr><td style="{cell}"><a href="{_url(block.get("link"))}" '
            f'style="display:inline-block;padding:12px 22px;border-radius:6px;'
            f'background-color:#4f46e5;color:#ffffff;font-weight:bold;text-decoration:none;">'
            f"{text}</a></td></tr>"
        )
    if kind == "divider":
        return (
            f'<tr><td style="{cell}"><hr style="border:0;border-top:1px solid #e5e7eb;margin:0;">'
            "</td></tr>"
        )
    if kind == "columns":
        left, _, right = str(block.get("text") or "").partition("|")
        col = "width:50%;vertical-align:top;padding:12px;background-color:#f3f4f6;"
        return (
            f'<tr><td style="{cell}"><table role="presentation" width="100%" cellpadding="0" '
            f'cellspacing="8"><tr><td style="{col}">{_text(left)}</td>'
            f'<td style="{col}">{_text(right)}</td></tr></table></td></tr>'
        )
    if kind == "product":
        src = _url(block.get("image"))
        return (
            f'<tr><td style="{cell}text-align:left;"><table role="presentation" cellpadding="0" '
            f'cellspacing="0"><tr><td style="padding-right:16px;"><img src="{src}" alt="" '
            f'width="80" height="80" style="display:block;border-radius:6px;"></td>'
            f'<td style="font-weight:bold;">{text}</td></tr></table></td></tr>'
        )
    if kind == "heading":
        return (
            f'<tr><td style="{cell}"><h2 style="margin:0;font-size:{size}px;">{text}</h2></td></tr>'
        )
    weight = "font-weight:bold;" if kind in ("logo", "banner") else ""
    return f'<tr><td style="{cell}{weight}">{text}</td></tr>'


def _preheader_div(preheader: str) -> str:
    return (
        '<div class="zm-preheader" style="display:none;max-height:0;overflow:hidden;opacity:0;">'
        f"{html_lib.escape(preheader)}</div>"
    )


def ensure_preheader(markup: str, preheader: str) -> str:
    """Insert the hidden inbox-preview text right after <body> if not already present."""
    if not preheader or "zm-preheader" in markup:
        return markup
    match = re.search(r"<body[^>]*>", markup, re.IGNORECASE)
    if match is None:
        return _preheader_div(preheader) + markup
    return markup[: match.end()] + _preheader_div(preheader) + markup[match.end() :]


def render_blocks(blocks: Sequence[Mapping[str, Any]], preheader: str = "") -> str:
    rows = "\n".join(_block_html(b) for b in blocks)
    hidden = _preheader_div(preheader) if preheader else ""
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        f'<body style="margin:0;padding:0;background-color:#f4f4f5;">{hidden}'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        'style="background-color:#f4f4f5;"><tr><td align="center" style="padding:24px 12px;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" '
        'style="max-width:600px;width:100%;background-color:#ffffff;">'
        f"{rows}</table></td></tr></table></body></html>"
    )


# --- Persistence -----------------------------------------------------------------


def _blocks(design: Sequence[Any] | None) -> list[dict[str, Any]]:
    return [b if isinstance(b, dict) else b.model_dump() for b in design or []]


async def list_templates(
    session: AsyncSession, *, category: str | None, q: str | None, offset: int, limit: int
) -> tuple[list[EmailTemplate], int]:
    stmt = select(EmailTemplate)
    if category:
        stmt = stmt.where(EmailTemplate.category == category)
    if q:
        stmt = stmt.where(ilike(EmailTemplate.name, q))
    stmt = stmt.order_by(EmailTemplate.created_at.desc(), EmailTemplate.name)
    return await paginate(session, stmt, offset=offset, limit=limit)


async def get_template(session: AsyncSession, template_id: str) -> EmailTemplate:
    template = await session.get(EmailTemplate, template_id)
    if template is None:
        raise NotFoundError(f"Template {template_id} not found")
    return template


async def create_template(session: AsyncSession, data: TemplateCreate) -> EmailTemplate:
    values = data.model_dump()
    values["design"] = _blocks(data.design)
    if values["design"] and not values["html"]:
        values["html"] = render_blocks(values["design"], data.preheader)
    template = EmailTemplate(**values)
    session.add(template)
    await session.commit()
    return template


async def update_template(
    session: AsyncSession, template_id: str, data: TemplateUpdate
) -> EmailTemplate:
    template = await get_template(session, template_id)
    changes = data.model_dump(exclude_unset=True)
    if "design" in changes:
        changes["design"] = _blocks(data.design)
    for key, value in changes.items():
        setattr(template, key, value)
    if (
        ("design" in changes or "preheader" in changes)
        and "html" not in changes
        and template.design
    ):
        template.html = render_blocks(template.design, template.preheader)
    await session.commit()
    return template


async def duplicate_template(session: AsyncSession, template_id: str) -> EmailTemplate:
    src = await get_template(session, template_id)
    copy = EmailTemplate(
        name=f"{src.name} (copy)"[:200],
        category=src.category,
        image=src.image,
        subject=src.subject,
        preheader=src.preheader,
        html=src.html,
        design=list(src.design or []),
    )
    session.add(copy)
    await session.commit()
    return copy


async def delete_template(session: AsyncSession, template_id: str) -> None:
    template = await get_template(session, template_id)
    await session.delete(template)
    await session.commit()


async def category_counts(session: AsyncSession) -> list[tuple[str, int]]:
    rows = await session.execute(
        select(EmailTemplate.category, func.count())
        .group_by(EmailTemplate.category)
        .order_by(EmailTemplate.category)
    )
    return [(name, count) for name, count in rows.all()]


def template_html(template: EmailTemplate) -> str:
    if template.html:
        return template.html
    return render_blocks(template.design or [], template.preheader)
