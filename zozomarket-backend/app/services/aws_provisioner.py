"""Automatic resolution and provisioning of AWS SES, CloudWatch, SNS, and SQS resources.

When a user saves their AWS Access Key, Secret Key, and Region in Settings:
1. Resolves the AWS Account ID via `sts:GetCallerIdentity` (allowed for all IAM users)
   to deterministically construct the SQS queue URL
   `https://sqs.<region>.amazonaws.com/<account-id>/zozomarket-ses-events-queue`
   and configuration set `zozomarket-tracking`.
2. If the IAM user also has admin/provisioning permissions, idempotently creates
   the SQS queue, SNS topic, and SES configuration set. If the IAM user is a
   least-privilege sender (like `zozomarket-ses-sender`), skips creation silently
   without noisy warnings and uses the resolved resources.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

DEFAULT_CONFIGURATION_SET = "zozomarket-tracking"
DEFAULT_DIMENSION_NAME = "campaign"
DEFAULT_DIMENSION_VALUE = "zozomarket"
DEFAULT_SNS_TOPIC_NAME = "zozomarket-ses-events"
DEFAULT_SQS_QUEUE_NAME = "zozomarket-ses-events-queue"
_EVENT_TYPES = ["SEND", "DELIVERY", "OPEN", "CLICK", "BOUNCE", "COMPLAINT", "REJECT"]
_ACCOUNT_ID_RE = re.compile(r"arn:aws:iam::(\d{12}):")


@dataclass(slots=True)
class ProvisioningResult:
    configuration_set: str = DEFAULT_CONFIGURATION_SET
    sqs_queue_url: str = ""
    s3_bucket_name: str = ""
    warnings: list[str] = field(default_factory=list)


def _is_access_denied(exc: Exception) -> bool:
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {
            "AccessDenied",
            "AccessDeniedException",
            "AuthorizationError",
            "UnauthorizedOperation",
        }:
            return True
    msg = str(exc)
    return "AccessDenied" in msg or "AuthorizationError" in msg or "not authorized" in msg


def _extract_account_id(text: str) -> str:
    match = _ACCOUNT_ID_RE.search(text)
    return match.group(1) if match else ""


def provision_aws_infrastructure(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    *,
    enable_s3_media: bool = True,
) -> ProvisioningResult:
    """Resolve or provision SES Configuration Set, CloudWatch, SNS, and SQS in AWS."""
    result = ProvisioningResult(configuration_set=DEFAULT_CONFIGURATION_SET)
    common_kwargs = {
        "region_name": region,
        "aws_access_key_id": access_key_id,
        "aws_secret_access_key": secret_access_key,
    }

    account_id = ""
    queue_arn = ""
    topic_arn = ""

    # 0. Discover AWS Account ID via STS (works for every valid IAM key without extra permissions)
    try:
        sts = boto3.client("sts", **common_kwargs)
        identity = sts.get_caller_identity()
        account_id = str(identity.get("Account", "")).strip()
    except Exception as exc:
        account_id = _extract_account_id(str(exc))

    if account_id:
        result.sqs_queue_url = (
            f"https://sqs.{region}.amazonaws.com/{account_id}/{DEFAULT_SQS_QUEUE_NAME}"
        )

    # 1. Resolve or Provision SQS Queue
    try:
        sqs = boto3.client("sqs", **common_kwargs)
        q_resp = sqs.create_queue(QueueName=DEFAULT_SQS_QUEUE_NAME)
        queue_url = q_resp.get("QueueUrl", "")
        if queue_url:
            result.sqs_queue_url = queue_url
            attrs = sqs.get_queue_attributes(
                QueueUrl=queue_url, AttributeNames=["QueueArn"]
            )
            queue_arn = attrs.get("Attributes", {}).get("QueueArn", "")
    except Exception as exc:
        if not account_id:
            account_id = _extract_account_id(str(exc))
            if account_id:
                result.sqs_queue_url = (
                    f"https://sqs.{region}.amazonaws.com/{account_id}/{DEFAULT_SQS_QUEUE_NAME}"
                )
        if _is_access_denied(exc):
            logger.debug("IAM user relies on pre-existing SQS queue (%s)", result.sqs_queue_url)
        else:
            logger.warning("Could not auto-provision SQS queue: %s", exc)
            result.warnings.append(f"SQS queue setup skipped: {exc}")

    # 2. Provision SNS Topic & Subscribe SQS Queue (if IAM user has SNS/SQS admin permissions)
    try:
        sns = boto3.client("sns", **common_kwargs)
        t_resp = sns.create_topic(Name=DEFAULT_SNS_TOPIC_NAME)
        topic_arn = t_resp.get("TopicArn", "")
        if topic_arn and queue_arn and result.sqs_queue_url:
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Sid": "AllowSESEventsFromSNS",
                        "Effect": "Allow",
                        "Principal": {"Service": "sns.amazonaws.com"},
                        "Action": "sqs:SendMessage",
                        "Resource": queue_arn,
                        "Condition": {"ArnEquals": {"aws:SourceArn": topic_arn}},
                    }
                ],
            }
            sqs.set_queue_attributes(
                QueueUrl=result.sqs_queue_url,
                Attributes={"Policy": json.dumps(policy)},
            )
            sns.subscribe(
                TopicArn=topic_arn,
                Protocol="sqs",
                Endpoint=queue_arn,
            )
    except Exception as exc:
        if _is_access_denied(exc):
            logger.debug("IAM user relies on pre-existing SNS topic (%s)", DEFAULT_SNS_TOPIC_NAME)
        else:
            logger.warning("Could not auto-provision SNS topic / subscription: %s", exc)
            result.warnings.append(f"SNS topic setup skipped: {exc}")

    # 3. Provision SES v2 Configuration Set & Event Destinations (if permitted)
    try:
        ses = boto3.client("sesv2", **common_kwargs)
        try:
            ses.get_configuration_set(ConfigurationSetName=DEFAULT_CONFIGURATION_SET)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code == "NotFoundException":
                ses.create_configuration_set(
                    ConfigurationSetName=DEFAULT_CONFIGURATION_SET,
                    SendingOptions={"SendingEnabled": True},
                    ReputationOptions={"ReputationMetricsEnabled": True},
                )
            else:
                raise

        result.configuration_set = DEFAULT_CONFIGURATION_SET

        # 3a. CloudWatch Event Destination
        cw_def = {
            "Enabled": True,
            "MatchingEventTypes": _EVENT_TYPES,
            "CloudWatchDestination": {
                "DimensionConfigurations": [
                    {
                        "DimensionName": DEFAULT_DIMENSION_NAME,
                        "DimensionValueSource": "MESSAGE_TAG",
                        "DefaultDimensionValue": DEFAULT_DIMENSION_VALUE,
                    }
                ]
            },
        }
        try:
            ses.create_configuration_set_event_destination(
                ConfigurationSetName=DEFAULT_CONFIGURATION_SET,
                EventDestinationName="zozomarket-cloudwatch",
                EventDestination=cw_def,
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "AlreadyExistsException":
                ses.update_configuration_set_event_destination(
                    ConfigurationSetName=DEFAULT_CONFIGURATION_SET,
                    EventDestinationName="zozomarket-cloudwatch",
                    EventDestination=cw_def,
                )
            elif not _is_access_denied(exc):
                logger.warning("Could not configure SES CloudWatch destination: %s", exc)

        # 3b. SNS Event Destination
        if topic_arn:
            sns_def = {
                "Enabled": True,
                "MatchingEventTypes": _EVENT_TYPES,
                "SnsDestination": {"TopicArn": topic_arn},
            }
            try:
                ses.create_configuration_set_event_destination(
                    ConfigurationSetName=DEFAULT_CONFIGURATION_SET,
                    EventDestinationName="zozomarket-sns",
                    EventDestination=sns_def,
                )
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") == "AlreadyExistsException":
                    ses.update_configuration_set_event_destination(
                        ConfigurationSetName=DEFAULT_CONFIGURATION_SET,
                        EventDestinationName="zozomarket-sns",
                        EventDestination=sns_def,
                    )
                elif not _is_access_denied(exc):
                    logger.warning("Could not configure SES SNS destination: %s", exc)
    except Exception as exc:
        if _is_access_denied(exc):
            logger.debug(
                "IAM user relies on pre-existing SES configuration set (%s)",
                DEFAULT_CONFIGURATION_SET,
            )
        else:
            logger.warning("Could not auto-provision SES configuration set: %s", exc)
            result.warnings.append(f"SES configuration set setup skipped: {exc}")

    # 4. Provision S3 Media Bucket (when enabled by the user's switch in Settings)
    if enable_s3_media:
        suffix = f"{account_id}-{region}" if account_id else region
        bucket_name = f"zozomarket-media-{suffix}".lower()[:63].rstrip("-")
        result.s3_bucket_name = bucket_name
        try:
            s3 = boto3.client("s3", **common_kwargs)
            try:
                s3.head_bucket(Bucket=bucket_name)
            except ClientError as exc:
                code = str(exc.response.get("Error", {}).get("Code", ""))
                if code in {"404", "NoSuchBucket"}:
                    create_kwargs: dict = {"Bucket": bucket_name}
                    if region != "us-east-1":
                        create_kwargs["CreateBucketConfiguration"] = {
                            "LocationConstraint": region
                        }
                    s3.create_bucket(**create_kwargs)
                else:
                    raise

            # Configure public read access & CORS for media/* objects
            try:
                s3.put_public_access_block(
                    Bucket=bucket_name,
                    PublicAccessBlockConfiguration={
                        "BlockPublicAcls": True,
                        "IgnorePublicAcls": True,
                        "BlockPublicPolicy": False,
                        "RestrictPublicBuckets": False,
                    },
                )
                bucket_policy = {
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Sid": "PublicReadMediaAssets",
                            "Effect": "Allow",
                            "Principal": "*",
                            "Action": "s3:GetObject",
                            "Resource": f"arn:aws:s3:::{bucket_name}/media/*",
                        }
                    ],
                }
                s3.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(bucket_policy))
                s3.put_bucket_cors(
                    Bucket=bucket_name,
                    CORSConfiguration={
                        "CORSRules": [
                            {
                                "AllowedHeaders": ["*"],
                                "AllowedMethods": ["GET", "HEAD"],
                                "AllowedOrigins": ["*"],
                                "MaxAgeSeconds": 86400,
                            }
                        ]
                    },
                )
            except Exception as policy_exc:
                logger.debug("S3 public bucket policy / CORS skipped: %s", policy_exc)
        except Exception as exc:
            if _is_access_denied(exc):
                logger.debug("IAM user relies on pre-existing S3 bucket (%s)", bucket_name)
            else:
                logger.debug("S3 media bucket setup skipped: %s", exc)

    return result
