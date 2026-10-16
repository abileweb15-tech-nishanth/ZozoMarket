"""Demo data mirroring the frontend's `data/marketing-data.json`, inserted only into an
empty database. IDs match the frontend mock IDs so existing links keep working."""

import datetime as dt
import logging

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Automation,
    AutomationStatus,
    Campaign,
    CampaignStatus,
    CampaignType,
    Contact,
    EmailStatDaily,
    EmailTemplate,
    Form,
    FormKind,
    FormStatus,
    MediaAsset,
    MediaType,
    SubscriptionStatus,
    TriggerType,
)
from app.services.contact_service import get_or_create_tags
from app.services.template_service import render_blocks

logger = logging.getLogger(__name__)
UTC = dt.UTC


def _at(day: str, time: str = "10:00") -> dt.datetime:
    return dt.datetime.fromisoformat(f"{day}T{time}:00").replace(tzinfo=UTC)


def _design(heading: str, body: str, cta: str, image: str) -> list[dict]:
    return [
        {"type": "logo", "text": "Acme Coffee Co.", "size": 18},
        {"type": "image", "text": heading, "image": image},
        {"type": "heading", "text": heading, "size": 28},
        {"type": "paragraph", "text": body, "size": 15},
        {"type": "button", "text": cta, "link": "https://example.com", "size": 15},
        {
            "type": "footer",
            "size": 12,
            "color": "#6b7280",
            "text": "Acme Coffee Co. · 12 Market St · You received this because you subscribed.",
        },
    ]


TEMPLATES = [
    ("t1", "Monthly Roundup", "Newsletter", "/images/tpl-newsletter.png"),
    ("t2", "Big Seasonal Sale", "Promotional", "/images/tpl-promo.png"),
    ("t3", "Warm Welcome", "Welcome Email", "/images/tpl-welcome.png"),
    ("t4", "New Arrival Spotlight", "Product Launch", "/images/tpl-launch.png"),
    ("t5", "You’re Invited", "Event Invitation", "/images/tpl-event.png"),  # noqa: RUF001
    ("t6", "Still Thinking It Over?", "Abandoned Cart", "/images/tpl-cart.png"),
    ("t7", "We Miss You", "Re-engagement", "/images/tpl-reengage.png"),
    ("t8", "Weekly Digest", "Newsletter", "/images/tpl-newsletter.png"),
]

# id, name, audience, tags, type, status, date, time, recipients, delivery%, open%, click%
CAMPAIGNS = [
    (
        "c1",
        "Spring Collection Launch",
        "All Subscribers",
        [],
        "Promotional",
        "Sent",
        "2026-10-02",
        "10:00",
        18420,
        98.6,
        41.2,
        6.8,
    ),
    (
        "c2",
        "October Newsletter",
        "Newsletter List",
        ["Newsletter"],
        "Newsletter",
        "Scheduled",
        "2026-10-15",
        "10:00",
        12350,
        None,
        None,
        None,
    ),
    (
        "c3",
        "Loyalty Rewards Reminder",
        "VIP Customers",
        ["VIP"],
        "Announcement",
        "Sending",
        "2026-10-12",
        "10:00",
        3210,
        97.1,
        18.4,
        2.1,
    ),
    (
        "c4",
        "Holiday Gift Guide",
        "All Subscribers",
        [],
        "Promotional",
        "Draft",
        "2026-11-20",
        "10:00",
        18420,
        None,
        None,
        None,
    ),
    (
        "c5",
        "Welcome Series — Email 1",
        "New Signups",
        [],
        "Automated",
        "Sent",
        "2026-09-28",
        "10:00",
        942,
        99.2,
        58.7,
        12.4,
    ),
    (
        "c6",
        "Flash Sale 48h",
        "Engaged 90 days",
        [],
        "Promotional",
        "Failed",
        "2026-09-21",
        "10:00",
        7650,
        12.0,
        3.1,
        0.4,
    ),
    (
        "c7",
        "Product Update: Cold Brew Kit",
        "Customers",
        ["Customer"],
        "Announcement",
        "Sent",
        "2026-09-14",
        "10:00",
        9880,
        98.9,
        36.5,
        5.2,
    ),
    (
        "c8",
        "Barista Workshop Invite",
        "Local Customers",
        ["Local"],
        "Announcement",
        "Scheduled",
        "2026-10-22",
        "10:00",
        2140,
        None,
        None,
        None,
    ),
    # Additional calendar entries from the frontend calendar mock.
    (
        "p3",
        "Cold Brew Guide (Drip #2)",
        "New Signups",
        [],
        "Automated",
        "Sent",
        "2026-10-05",
        "11:00",
        880,
        99.0,
        47.3,
        8.9,
    ),
    (
        "p2",
        "Behind the Roastery Newsletter",
        "Newsletter List",
        ["Newsletter"],
        "Newsletter",
        "Sent",
        "2026-10-08",
        "14:30",
        12010,
        98.7,
        39.4,
        5.6,
    ),
    (
        "p1",
        "Autumn Oat Latte Special Promo",
        "All Subscribers",
        [],
        "Promotional",
        "Scheduled",
        "2026-10-13",
        "09:00",
        18420,
        None,
        None,
        None,
    ),
    (
        "p4",
        "Workshop Seats Reminder",
        "Workshop",
        ["Workshop"],
        "Announcement",
        "Draft",
        "2026-10-16",
        "12:00",
        0,
        None,
        None,
        None,
    ),
    (
        "p6",
        "Eco Cups Product Update",
        "Customers",
        ["Customer"],
        "Announcement",
        "Scheduled",
        "2026-10-18",
        "08:30",
        9880,
        None,
        None,
        None,
    ),
    (
        "e1",
        "Weekend Brunch VIP Offer",
        "VIP Customers",
        ["VIP"],
        "Promotional",
        "Scheduled",
        "2026-10-24",
        "09:30",
        3210,
        None,
        None,
        None,
    ),
    (
        "e2",
        "Halloween Special Broadcast",
        "All Subscribers",
        [],
        "Promotional",
        "Draft",
        "2026-10-29",
        "08:00",
        18420,
        None,
        None,
        None,
    ),
]

CONTACTS = [
    (
        "u1",
        "Priya Raman",
        "priya.raman@example.com",
        ["VIP", "Newsletter"],
        "Signup Form",
        "Subscribed",
        "2026-09-30",
    ),
    (
        "u2",
        "Marcus Lee",
        "marcus.lee@example.com",
        ["Customer"],
        "CSV Import",
        "Subscribed",
        "2026-09-22",
    ),
    (
        "u3",
        "Sofia García",
        "sofia.g@example.com",
        ["Workshop"],
        "Landing Page",
        "Pending",
        "2026-10-09",
    ),
    (
        "u4",
        "Tom Becker",
        "tom.becker@example.com",
        ["Customer"],
        "Checkout",
        "Unsubscribed",
        "2026-08-14",
    ),
    ("u5", "Aiko Tanaka", "aiko.t@example.com", ["VIP"], "Popup Form", "Subscribed", "2026-10-01"),
    (
        "u6",
        "David Okafor",
        "d.okafor@example.com",
        ["Newsletter"],
        "Signup Form",
        "Subscribed",
        "2026-07-19",
    ),
    ("u7", "Lena Novak", "lena.novak@example.com", ["Local"], "Manual", "Subscribed", "2026-10-11"),
]

MEDIA = [
    ("m1", "maple-latte-hero.png", "Image", 1_258_291, "image/png", "/images/post-latte.png"),
    ("m2", "roastery-tour.mp4", "Video", 50_960_793, "video/mp4", "/images/post-roastery.png"),
    ("m3", "cold-brew-steps.png", "Image", 1_003_520, "image/png", "/images/post-coldbrew.png"),
    ("m4", "workshop-banner.png", "Image", 778_240, "image/png", "/images/post-workshop.png"),
    ("m5", "beans-flatlay.png", "Image", 1_572_864, "image/png", "/images/post-beans.png"),
    ("m6", "compostable-cups.png", "Image", 1_153_434, "image/png", "/images/post-cups.png"),
]

FORMS = [
    ("Newsletter Signup", "newsletter-signup", FormKind.SIGNUP, FormStatus.LIVE, 8420, 912),
    ("Barista Workshop RSVP", "barista-workshop", FormKind.LANDING, FormStatus.LIVE, 3105, 284),
    ("Fall Menu Landing", "fall-menu", FormKind.LANDING, FormStatus.DRAFT, 0, 0),
    ("Footer Signup", "footer-signup", FormKind.EMBEDDED, FormStatus.LIVE, 15230, 540),
    ("10% Off Exit Popup", "exit-popup", FormKind.POPUP, FormStatus.PAUSED, 6200, 610),
]

# Weekly totals from the frontend's emailPerformance chart (week starting Monday).
WEEKLY = [
    ("2026-08-31", 12400, 4800, 720),
    ("2026-09-07", 14100, 5600, 810),
    ("2026-09-14", 13200, 5100, 760),
    ("2026-09-21", 16800, 6900, 1050),
    ("2026-09-28", 18200, 7400, 1180),
    ("2026-10-05", 19600, 8100, 1320),
]


def _email(subject: str, body: str, template: str | None = None) -> dict:
    cfg = {"subject": subject, "body": body}
    if template:
        cfg["templateId"] = template
    return cfg


AUTOMATIONS = [
    {
        "id": "a1",
        "name": "Welcome Series",
        "trigger": "Contact subscribes",
        "trigger_type": TriggerType.CONTACT_SUBSCRIBED,
        "audience": "New Signups",
        "status": AutomationStatus.ACTIVE,
        "nodes": [
            ("Trigger", "Contact subscribes to Newsletter", {}),
            (
                "Email",
                "Send “Welcome to Acme”",
                _email(
                    "Welcome to Acme, {{first_name}}!",
                    "Hi {{first_name}},\n\nThanks for joining us. Expect seasonal brews, "
                    "barista tips and member-only offers.",
                    "t3",
                ),
            ),
            ("Delay", "Wait 2 days", {"amount": 2, "unit": "days"}),
            (
                "Email",
                "Send “Our story”",
                _email(
                    "The story behind every cup",
                    "We started roasting in a tiny garage in 2015. "
                    "Here's what we've learned since.",
                ),
            ),
            ("Delay", "Wait 3 days", {"amount": 3, "unit": "days"}),
            (
                "Email",
                "Send “10% first order”",
                _email(
                    "A little welcome gift: 10% off",
                    "Use code WELCOME10 on your first order this week.",
                ),
            ),
            ("End", "End workflow", {}),
        ],
    },
    {
        "id": "a2",
        "name": "Re-engagement",
        "trigger": "No opens in 90 days",
        "trigger_type": TriggerType.INACTIVITY,
        "audience": "Inactive",
        "status": AutomationStatus.PAUSED,
        "nodes": [
            ("Trigger", "No email opened in 90 days", {}),
            (
                "Email",
                "Send “We miss you”",
                _email(
                    "We miss you, {{first_name}}", "It's been a while! Here's what's new.", "t7"
                ),
            ),
            ("Delay", "Wait 5 days", {"amount": 5, "unit": "days"}),
            ("Condition", "Opened previous email?", {"type": "opened_previous"}),
            (
                "Email",
                "Send final coupon",
                _email("One last treat before you go", "Here's 15% off — code COMEBACK15."),
            ),
            ("End", "End workflow", {}),
        ],
    },
    {
        "id": "a3",
        "name": "Abandoned Signup Follow-up",
        "trigger": "Form started, not submitted",
        "trigger_type": TriggerType.FORM_ABANDONED,
        "audience": "Leads",
        "status": AutomationStatus.DRAFT,
        "nodes": [
            ("Trigger", "Signup form abandoned", {}),
            ("Delay", "Wait 1 hour", {"amount": 1, "unit": "hours"}),
            ("Email", "Send reminder", {}),
            ("End", "End workflow", {}),
        ],
    },
    {
        "id": "a4",
        "name": "Post-Purchase Follow-up",
        "trigger": "Order completed",
        "trigger_type": TriggerType.ORDER_COMPLETED,
        "audience": "Customers",
        "status": AutomationStatus.ACTIVE,
        "nodes": [
            ("Trigger", "Order completed", {}),
            ("Delay", "Wait 7 days", {"amount": 7, "unit": "days"}),
            (
                "Email",
                "Ask for a review",
                _email("How was your order, {{first_name}}?", "We'd love to hear what you think."),
            ),
            ("Condition", "Left a review?", {"type": "clicked_previous"}),
            (
                "Email",
                "Send thank-you reward",
                _email("Thank you! Here's a reward", "Enjoy a free pastry on your next visit."),
            ),
            ("End", "End workflow", {}),
        ],
    },
]


async def seed_demo_data(session: AsyncSession) -> bool:
    if await session.scalar(select(func.count()).select_from(Campaign)):
        return False
    logger.info("Seeding demo data")

    for tid, name, category, image in TEMPLATES:
        design = _design(
            name, f"A ready-to-use {category.lower()} layout.", "Shop now", "/images/post-latte.png"
        )
        session.add(
            EmailTemplate(
                id=tid,
                name=name,
                category=category,
                image=image,
                is_system=True,
                subject=name,
                design=design,
                html=render_blocks(design),
            )
        )
    await session.flush()

    for cid, name, audience, tags, ctype, status, day, time, recipients, dlv, opn, clk in CAMPAIGNS:
        at = _at(day, time)
        design = _design(
            name, "Discover what's new at Acme Coffee Co.", "Read more", "/images/post-beans.png"
        )
        campaign = Campaign(
            id=cid,
            name=name,
            audience=audience,
            audience_tags=tags,
            type=CampaignType(ctype),
            status=CampaignStatus(status),
            subject=name,
            preheader="",
            design=design,
            html=render_blocks(design),
            recipients=recipients,
            created_at=at - dt.timedelta(days=7),
            updated_at=at - dt.timedelta(days=1),
        )
        if status in ("Scheduled", "Draft"):
            campaign.scheduled_at = at if status == "Scheduled" else None
            if status == "Draft":
                campaign.created_at = at
        else:
            campaign.started_at = at
            campaign.sent_at = at if status != "Sending" else None
            campaign.updated_at = at
            campaign.sent_count = recipients
            campaign.delivered_count = round(recipients * (dlv or 0) / 100)
            campaign.opened_count = round(campaign.delivered_count * (opn or 0) / 100)
            campaign.clicked_count = round(campaign.delivered_count * (clk or 0) / 100)
            campaign.bounced_count = campaign.sent_count - campaign.delivered_count
            if status == "Failed":
                campaign.failure_reason = "Provider rejected the batch (demo data)"
        session.add(campaign)

    for uid, name, email, tags, source, status, added in CONTACTS:
        added_at = _at(added, "09:00")
        contact = Contact(
            id=uid,
            name=name,
            email=email,
            source=source,
            status=SubscriptionStatus(status),
            created_at=added_at,
            updated_at=added_at,
            subscribed_at=added_at if status == "Subscribed" else None,
        )
        contact.tags = await get_or_create_tags(session, tags)
        session.add(contact)

    for mid, name, mtype, size, mime, url in MEDIA:
        session.add(
            MediaAsset(
                id=mid, name=name, type=MediaType(mtype), size_bytes=size, mime_type=mime, url=url
            )
        )

    for name, slug, kind, status, views, subs in FORMS:
        session.add(
            Form(
                name=name,
                slug=slug,
                kind=kind,
                status=status,
                views=views,
                submissions=subs,
                title="Join the Acme Coffee newsletter",
                success_message="Thanks! Check your inbox to confirm your subscription.",
                fields=[{"name": "company", "label": "Company", "type": "text", "required": False}],
                tags=["Newsletter"],
            )
        )

    for spec in AUTOMATIONS:
        session.add(
            Automation(
                id=spec["id"],
                name=spec["name"],
                trigger=spec["trigger"],
                trigger_type=spec["trigger_type"],
                audience=spec["audience"],
                status=spec["status"],
                nodes=[
                    {"id": f"{spec['id']}-n{i}", "kind": k, "label": label, "config": cfg}
                    for i, (k, label, cfg) in enumerate(spec["nodes"])
                ],
            )
        )

    # Spread weekly chart totals across weekdays as daily aggregate rows.
    weights = [0.2, 0.18, 0.17, 0.16, 0.14, 0.08, 0.07]
    for week_start, delivered, opens, clicks in WEEKLY:
        start = dt.date.fromisoformat(week_start)
        for i, w in enumerate(weights):
            d = round(delivered * w)
            session.add(
                EmailStatDaily(
                    day=start + dt.timedelta(days=i),
                    campaign_id="",
                    sent=round(d / 0.988),
                    delivered=d,
                    opens=round(opens * w),
                    clicks=round(clicks * w),
                    bounces=round(d / 0.988) - d,
                    unsubscribes=round(d * 0.002),
                )
            )

    try:
        await session.commit()
    except IntegrityError:
        # Another worker process seeded concurrently at startup.
        await session.rollback()
        return False
    return True
