"""Lead capture forms & landing pages, including public submission and double opt-in."""

import html as html_lib
import json
import re
import secrets
from pathlib import Path
from string import Template
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ConflictError, NotFoundError
from app.core.security import sign_token, verify_token
from app.models.automation import TriggerType
from app.models.base import utcnow
from app.models.contact import Contact, SubscriptionStatus
from app.models.form import Form, FormKind, FormStatus
from app.schemas.form import FormCreate, FormSubmission, FormUpdate
from app.services import automation_service, contact_service, email_service
from app.services.query import ilike, paginate

CONFIRM_TTL_SECONDS = 7 * 24 * 3600


def public_url(form: Form) -> str:
    return email_service.api_url(f"/public/forms/{form.slug}")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:100] or "form"


async def _unique_slug(session: AsyncSession, base: str, exclude_id: str | None = None) -> str:
    candidate = base
    while True:
        stmt = select(Form.id).where(Form.slug == candidate)
        if exclude_id:
            stmt = stmt.where(Form.id != exclude_id)
        if await session.scalar(stmt) is None:
            return candidate
        candidate = f"{base}-{secrets.token_hex(2)}"


# --- Admin CRUD ----------------------------------------------------------------------


async def list_forms(
    session: AsyncSession,
    *,
    kind: FormKind | None,
    status: FormStatus | None,
    q: str | None,
    offset: int,
    limit: int,
) -> tuple[list[Form], int]:
    stmt = select(Form)
    if kind:
        stmt = stmt.where(Form.kind == kind)
    if status:
        stmt = stmt.where(Form.status == status)
    if q:
        stmt = stmt.where(ilike(Form.name, q))
    return await paginate(
        session, stmt.order_by(Form.created_at.desc()), offset=offset, limit=limit
    )


async def get_form(session: AsyncSession, form_id: str) -> Form:
    form = await session.get(Form, form_id)
    if form is None:
        raise NotFoundError(f"Form {form_id} not found")
    return form


async def create_form(session: AsyncSession, data: FormCreate) -> Form:
    values = data.model_dump(exclude={"slug"})
    values["fields"] = [f.model_dump() for f in data.fields]
    if data.slug:
        if await session.scalar(select(Form.id).where(Form.slug == data.slug)):
            raise ConflictError(f"Slug '{data.slug}' is already in use")
        slug = data.slug
    else:
        slug = await _unique_slug(session, _slugify(data.name))
    form = Form(**values, slug=slug, status=FormStatus.DRAFT)
    session.add(form)
    await session.commit()
    return form


async def update_form(session: AsyncSession, form_id: str, data: FormUpdate) -> Form:
    form = await get_form(session, form_id)
    changes = data.model_dump(exclude_unset=True)
    new_slug = changes.get("slug")
    if (
        new_slug
        and new_slug != form.slug
        and await session.scalar(select(Form.id).where(Form.slug == new_slug))
    ):
        raise ConflictError(f"Slug '{new_slug}' is already in use")
    if "fields" in changes and data.fields is not None:
        changes["fields"] = [f.model_dump() for f in data.fields]
    for key, value in changes.items():
        if value is not None or key == "redirect_url":
            setattr(form, key, value)
    form.updated_at = utcnow()
    await session.commit()
    return form


async def delete_form(session: AsyncSession, form_id: str) -> None:
    form = await get_form(session, form_id)
    await session.delete(form)
    await session.commit()


# --- Public ------------------------------------------------------------------------------


async def get_live_form(session: AsyncSession, slug: str) -> Form:
    form = await session.scalar(select(Form).where(Form.slug == slug))
    if form is None or form.status is not FormStatus.LIVE:
        raise NotFoundError("Form not found")
    return form


async def record_view(session: AsyncSession, slug: str) -> None:
    form = await get_live_form(session, slug)
    await session.execute(update(Form).where(Form.id == form.id).values(views=Form.views + 1))
    await session.commit()


def _validate_fields(form: Form, values: dict[str, Any]) -> dict[str, Any]:
    allowed = {f["name"]: f for f in form.fields or []}
    cleaned: dict[str, Any] = {}
    missing = []
    for name, spec in allowed.items():
        value = values.get(name)
        if isinstance(value, str):
            value = value.strip()[:1000]
        if spec.get("required") and value in (None, "", False):
            missing.append(spec.get("label", name))
        elif value not in (None, ""):
            cleaned[name] = value
    if missing:
        raise AppError("Missing required fields", code="validation_error", details=missing)
    return cleaned


async def submit(session: AsyncSession, slug: str, data: FormSubmission) -> dict[str, Any]:
    form = await get_live_form(session, slug)
    result = {
        "message": form.success_message,
        "redirect_url": form.redirect_url,
        "requires_confirmation": form.double_opt_in,
    }
    if data.website:
        return result  # honeypot tripped: pretend success, store nothing
    if not data.consent:
        raise AppError("Consent is required to subscribe", code="consent_required")
    attributes = _validate_fields(form, data.fields)

    target = SubscriptionStatus.PENDING if form.double_opt_in else SubscriptionStatus.SUBSCRIBED
    contact = await contact_service.get_by_email(session, data.email)
    newly_subscribed = False
    if contact is None:
        contact = Contact(
            email=contact_service.normalize_email(data.email),
            name=data.name,
            source=form.kind.value.removesuffix("s"),
            attributes=attributes,
            status=target,
        )
        contact.tags = await contact_service.get_or_create_tags(session, form.tags)
        if target is SubscriptionStatus.SUBSCRIBED:
            contact.subscribed_at = utcnow()
            newly_subscribed = True
        session.add(contact)
    else:
        if data.name and not contact.name:
            contact.name = data.name
        contact.attributes = {**(contact.attributes or {}), **attributes}
        merged = {*contact.tag_names, *form.tags}
        contact.tags = await contact_service.get_or_create_tags(session, sorted(merged))
        if contact.status is not SubscriptionStatus.SUBSCRIBED:
            # Explicit re-opt-in through a form is valid consent.
            contact.status = target
            if target is SubscriptionStatus.SUBSCRIBED:
                contact.subscribed_at = utcnow()
                contact.unsubscribed_at = None
                newly_subscribed = True
    await session.flush()
    await session.execute(
        update(Form).where(Form.id == form.id).values(submissions=Form.submissions + 1)
    )
    if contact.status is SubscriptionStatus.SUBSCRIBED:
        await automation_service.handle_event(
            session, TriggerType.FORM_SUBMITTED, contact, {"formId": form.id}
        )
        if newly_subscribed:
            await automation_service.handle_event(
                session, TriggerType.CONTACT_SUBSCRIBED, contact, {"formId": form.id}
            )
    await session.commit()

    if contact.status is SubscriptionStatus.PENDING:
        await send_confirmation(contact, form)
    return result


async def send_confirmation(contact: Contact, form: Form) -> None:
    token = sign_token("confirm", {"c": contact.id, "f": form.id}, ttl_seconds=CONFIRM_TTL_SECONDS)
    link = email_service.api_url(f"/public/confirm/{token}")
    title = html_lib.escape(form.title or form.name)
    await email_service.send_email(
        email_service.OutboundEmail(
            to=contact.email,
            subject="Please confirm your subscription",
            html=(
                f"<p>Thanks for signing up to <strong>{title}</strong>.</p>"
                f'<p><a href="{link}">Confirm my subscription</a></p>'
                "<p>If you didn't request this, you can ignore this email.</p>"
            ),
        )
    )


async def confirm(session: AsyncSession, token: str) -> Contact:
    payload = verify_token("confirm", token)
    if not payload:
        raise AppError("This confirmation link is invalid or has expired", code="invalid_token")
    contact = await session.get(Contact, payload["c"])
    if contact is None:
        raise NotFoundError("Contact not found")
    if contact.status is SubscriptionStatus.PENDING:
        contact.status = SubscriptionStatus.SUBSCRIBED
        contact.subscribed_at = utcnow()
        await session.flush()
        data = {"formId": payload.get("f")}
        await automation_service.handle_event(session, TriggerType.FORM_SUBMITTED, contact, data)
        await automation_service.handle_event(
            session, TriggerType.CONTACT_SUBSCRIBED, contact, data
        )
        await session.commit()
    return contact


_LANDING_PAGE = Template((Path(__file__).parent / "landing_page.html").read_text("utf-8"))


def render_landing_page(form: Form, submit_url: str) -> str:
    esc = html_lib.escape
    extra = "".join(
        f'<label>{esc(f["label"])}<input name="{esc(f["name"])}" '
        f'type="{esc(f.get("type", "text"))}"{" required" if f.get("required") else ""}></label>'
        for f in form.fields or []
    )
    return _LANDING_PAGE.substitute(
        title=esc(form.title or form.name),
        description=esc(form.description),
        extra_fields=extra,
        # json.dumps output is a valid JS string literal; escape "<" so it can't close <script>.
        submit_url_json=json.dumps(submit_url).replace("<", "\\u003c"),
    )
