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
_FONT = re.compile(r"^[A-Za-z0-9 ,\-]{1,64}$")
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


def _font(value: Any) -> str:
    value = str(value or "").strip()
    return value if _FONT.match(value) else "Arial,Helvetica,sans-serif"


def _url(value: Any) -> str:
    value = str(value or "").strip()
    return html_lib.escape(value, quote=True) if value and _SAFE_URL.match(value) else "#"


def _text(value: Any) -> str:
    return html_lib.escape(str(value or "")).replace("\n", "<br>")


def _px(value: Any, default: int, low: int, high: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(number, high))


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
    family = _font(block.get("font"))
    cell = (
        f"padding:{padding}px;text-align:{align};color:{color};background-color:{bg};"
        f"font-size:{size}px;font-family:{family};line-height:1.5;"
    )

    if kind == "spacer":
        return f'<tr><td style="height:{padding}px;line-height:{padding}px;">&nbsp;</td></tr>'
    if kind == "image":
        src = _url(block.get("image"))
        width = _px(block.get("width"), 600, 40, 600)
        return (
            f'<tr><td style="padding:{padding}px;text-align:{align};background-color:{bg};">'
            f'<img src="{src}" alt="{text}" width="{width}" '
            f'style="display:inline-block;width:{width}px;max-width:100%;height:auto;border:0;">'
            "</td></tr>"
        )
    if kind == "logo" and block.get("image"):
        src = _url(block.get("image"))
        width = _px(block.get("width"), 160, 40, 320)
        return (
            f'<tr><td style="{cell}"><img src="{src}" alt="{text}" width="{width}" '
            f'style="display:inline-block;width:{width}px;max-width:100%;height:auto;border:0;">'
            "</td></tr>"
        )
    if kind == "button":
        btn_bg = bg if bg.lower() not in {"#fff", "#ffffff"} else "#4f46e5"
        return (
            f'<tr><td style="padding:{padding}px;text-align:{align};background-color:#ffffff;'
            f'font-family:{family};">'
            f'<a href="{_url(block.get("link"))}" '
            f'style="display:inline-block;padding:12px 22px;border-radius:6px;'
            f"background-color:{btn_bg};color:{color};font-weight:bold;text-decoration:none;"
            f'font-family:{family};font-size:{size}px;">{text}</a></td></tr>'
        )
    if kind == "divider":
        return (
            f'<tr><td style="{cell}"><hr style="border:0;border-top:1px solid {color};margin:0;">'
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
        width = _px(block.get("width"), 80, 40, 240)
        return (
            f'<tr><td style="{cell}text-align:left;"><table role="presentation" cellpadding="0" '
            f'cellspacing="0"><tr><td style="padding-right:16px;"><img src="{src}" alt="" '
            f'width="{width}" style="display:block;width:{width}px;max-width:100%;height:auto;'
            f'border-radius:6px;"></td>'
            f'<td style="font-weight:bold;">{text}</td></tr></table></td></tr>'
        )
    if kind == "heading":
        return (
            f'<tr><td style="{cell}"><h2 style="margin:0;font-size:{size}px;">{text}</h2></td></tr>'
        )
    if kind == "footer":
        link = (
            '<a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">'
            "Unsubscribe</a>"
        )
        body = text if "unsubscribe_url" in str(block.get("text") or "") else f"{text}<br>{link}"
        return f'<tr><td style="{cell}">{body}</td></tr>'
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


def _unsubscribe_row() -> str:
    return (
        '<tr><td style="padding:16px;text-align:center;color:#6b7280;font-size:12px;'
        'font-family:Arial,Helvetica,sans-serif;">'
        '<a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">'
        "Unsubscribe</a></td></tr>"
    )


def brand_blocks(blocks: Sequence[Mapping[str, Any]], workspace: Any) -> list[dict[str, Any]]:
    """Logo and footer follow the workspace profile. The rest of the design is unchanged."""
    if workspace is None:
        return [dict(block) for block in blocks]
    name = getattr(workspace, "name", "") or ""
    brand_name = (getattr(workspace, "from_name", None) or "").strip() or name
    address = (getattr(workspace, "mailing_address", None) or "").strip()
    place = address or name
    branded: list[dict[str, Any]] = []
    for raw in blocks:
        block = dict(raw)
        kind = block.get("type")
        if kind == "logo":
            if brand_name:
                block["text"] = brand_name
            if getattr(workspace, "brand_color", None):
                block["color"] = workspace.brand_color
            if getattr(workspace, "font", None):
                block["font"] = workspace.font
            if getattr(workspace, "logo_url", None):
                block["image"] = workspace.logo_url
        elif kind == "footer" and place:
            block["text"] = f"{place} · {{{{unsubscribe_url}}}}"
        branded.append(block)
    return branded


def render_blocks(blocks: Sequence[Mapping[str, Any]], preheader: str = "") -> str:
    rendered = [_block_html(b) for b in blocks]
    if not any("unsubscribe_url" in row for row in rendered):
        rendered.append(_unsubscribe_row())
    rows = "\n".join(rendered)
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
