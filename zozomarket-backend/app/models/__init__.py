"""Import every model so SQLAlchemy/Alembic see the full metadata."""

from app.models.automation import (
    Automation,
    AutomationEnrollment,
    AutomationStatus,
    EnrollmentStatus,
    NodeKind,
    TriggerType,
)
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.contact import Contact, SubscriptionStatus, Tag, contact_tags
from app.models.form import Form, FormKind, FormStatus
from app.models.media import MediaAsset, MediaType
from app.models.message import EmailMessage, EmailStatDaily, MessageStatus
from app.models.template import EmailTemplate

__all__ = [
    "Automation",
    "AutomationEnrollment",
    "AutomationStatus",
    "Campaign",
    "CampaignStatus",
    "CampaignType",
    "Contact",
    "EmailMessage",
    "EmailStatDaily",
    "EmailTemplate",
    "EnrollmentStatus",
    "Form",
    "FormKind",
    "FormStatus",
    "MediaAsset",
    "MediaType",
    "MessageStatus",
    "NodeKind",
    "SubscriptionStatus",
    "Tag",
    "TriggerType",
    "contact_tags",
]
