PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


async def test_workspace_starts_empty_and_saves(client):
    loaded = await client.get("/api/v1/workspace")
    assert loaded.status_code == 200, loaded.text
    data = loaded.json()["data"]
    assert data["name"] == "Test Workspace"
    assert data["ownerEmail"] == "test@example.com"
    assert data["website"] is None
    assert data["logoUrl"] is None
    assert data["trackOpens"] is True

    saved = await client.patch(
        "/api/v1/workspace",
        json={
            "name": "North Studio",
            "website": "https://north.example",
            "timezone": "Asia/Kolkata",
            "mailingAddress": "12 Market St",
            "fromEmail": "hello@north.example",
            "trackClicks": False,
        },
    )
    assert saved.status_code == 200, saved.text
    body = saved.json()["data"]
    assert body["name"] == "North Studio"
    assert body["timezone"] == "Asia/Kolkata"
    assert body["trackClicks"] is False

    again = await client.get("/api/v1/workspace")
    assert again.json()["data"]["mailingAddress"] == "12 Market St"


async def test_logo_is_stored_as_a_file(client):
    uploaded = await client.post(
        "/api/v1/workspace/logo", files={"file": ("logo.png", PNG, "image/png")}
    )
    assert uploaded.status_code == 200, uploaded.text
    url = uploaded.json()["data"]["logoUrl"]
    assert "/media/" in url
    fetched = await client.get(url)
    assert fetched.status_code == 200
    assert fetched.content.startswith(b"\x89PNG")


async def test_aws_settings_save_mask_and_cache(client, monkeypatch):
    from app.services.aws_credentials import (
        decrypt_credential,
        encrypt_credential,
        get_aws_credentials,
    )
    from app.services.aws_provisioner import ProvisioningResult

    monkeypatch.setattr(
        "app.services.workspace_service.provision_aws_infrastructure",
        lambda access_key, secret_key, region, **kw: ProvisioningResult(
            configuration_set="zozomarket-tracking",
            sqs_queue_url=f"https://sqs.{region}.amazonaws.com/123456789012/zozomarket-ses-events-queue",
            s3_bucket_name=(
                f"zozomarket-media-123456789012-{region}"
                if kw.get("enable_s3_media", True)
                else ""
            ),
            warnings=[],
        ),
    )

    initial = await client.get("/api/v1/workspace")
    assert initial.status_code == 200
    data = initial.json()["data"]
    assert data["hasAwsAccessKey"] is False
    assert data["hasAwsSecretKey"] is False
    assert data["awsRegion"] == "us-east-1"
    assert data["awsEncryptionDisabled"] is False

    res = await client.patch(
        "/api/v1/workspace/aws",
        json={
            "awsAccessKeyId": "AKIAIOSFODNN7EXAMPLE",
            "awsSecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "awsRegion": "ap-southeast-2",
            "awsEncryptionDisabled": False,
        },
    )
    assert res.status_code == 200, res.text
    saved = res.json()["data"]
    assert saved["hasAwsAccessKey"] is True
    assert saved["hasAwsSecretKey"] is True
    assert saved["awsRegion"] == "ap-southeast-2"
    assert saved["awsEncryptionDisabled"] is False
    assert saved["sesConfigurationSet"] == "zozomarket-tracking"
    assert (
        saved["sqsQueueUrl"]
        == "https://sqs.ap-southeast-2.amazonaws.com/123456789012/zozomarket-ses-events-queue"
    )
    assert "AKIAIOSFODNN7EXAMPLE" not in res.text
    assert "wJalrXUtnFEMI" not in res.text

    creds = get_aws_credentials()
    assert creds is not None
    assert creds.access_key_id == "AKIAIOSFODNN7EXAMPLE"
    assert creds.secret_access_key == "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    assert creds.region == "ap-southeast-2"
    assert creds.configuration_set == "zozomarket-tracking"
    assert (
        creds.sqs_queue_url
        == "https://sqs.ap-southeast-2.amazonaws.com/123456789012/zozomarket-ses-events-queue"
    )
    assert creds.from_email == "hello@example.com"

    # Updating only region keeps both keys intact
    region_only = await client.patch(
        "/api/v1/workspace/aws",
        json={"awsRegion": "eu-west-1"},
    )
    assert region_only.status_code == 200
    assert region_only.json()["data"]["hasAwsAccessKey"] is True
    assert region_only.json()["data"]["hasAwsSecretKey"] is True
    assert get_aws_credentials().region == "eu-west-1"
    assert get_aws_credentials().access_key_id == "AKIAIOSFODNN7EXAMPLE"

    # Encryption helper round-trips
    enc = encrypt_credential("my-secret", disable_encryption=False)
    assert enc.startswith("enc:v1:")
    assert decrypt_credential(enc) == "my-secret"

    plain = encrypt_credential("my-secret", disable_encryption=True)
    assert plain == "my-secret"
    assert decrypt_credential(plain) == "my-secret"


def test_provision_aws_infrastructure_idempotent(monkeypatch):
    from app.services.aws_provisioner import provision_aws_infrastructure

    calls: list[str] = []

    class FakeSqs:
        def create_queue(self, QueueName: str):
            calls.append(f"sqs.create_queue:{QueueName}")
            return {"QueueUrl": f"https://sqs.us-east-1.amazonaws.com/111/{QueueName}"}

        def get_queue_attributes(self, QueueUrl: str, AttributeNames: list[str]):
            return {"Attributes": {"QueueArn": "arn:aws:sqs:us-east-1:111:zozomarket-ses-events-queue"}}

        def set_queue_attributes(self, QueueUrl: str, Attributes: dict):
            calls.append("sqs.set_queue_attributes")

    class FakeSns:
        def create_topic(self, Name: str):
            calls.append(f"sns.create_topic:{Name}")
            return {"TopicArn": f"arn:aws:sns:us-east-1:111:{Name}"}

        def subscribe(self, **kwargs):
            calls.append("sns.subscribe")

    class FakeSes:
        def get_configuration_set(self, ConfigurationSetName: str):
            calls.append(f"ses.get_configuration_set:{ConfigurationSetName}")
            return {}

        def create_configuration_set_event_destination(self, **kwargs):
            calls.append(f"ses.dest:{kwargs['EventDestinationName']}")

    def fake_client(service: str, **kwargs):
        if service == "sts":
            return type("FakeSts", (), {"get_caller_identity": lambda self: {"Account": "111"}})()
        if service == "sqs":
            return FakeSqs()
        if service == "sns":
            return FakeSns()
        if service == "sesv2":
            return FakeSes()
        if service == "s3":
            return type(
                "FakeS3",
                (),
                {
                    "head_bucket": lambda self, **kw: {},
                    "put_public_access_block": lambda self, **kw: {},
                    "put_bucket_policy": lambda self, **kw: {},
                    "put_bucket_cors": lambda self, **kw: {},
                },
            )()
        raise AssertionError(service)

    monkeypatch.setattr("boto3.client", fake_client)
    res = provision_aws_infrastructure("AKIA...", "SECRET...", "us-east-1")
    assert res.configuration_set == "zozomarket-tracking"
    assert res.sqs_queue_url.endswith("/zozomarket-ses-events-queue")
    assert res.warnings == []
    assert "ses.dest:zozomarket-cloudwatch" in calls
    assert "ses.dest:zozomarket-sns" in calls


def test_provision_aws_infrastructure_least_privilege_sender(monkeypatch):
    from botocore.exceptions import ClientError

    from app.services.aws_provisioner import provision_aws_infrastructure

    class DeniedClient:
        def __getattr__(self, name: str):
            def _raise(**kwargs):
                raise ClientError(
                    {
                        "Error": {
                            "Code": "AccessDenied",
                            "Message": (
                                "User: arn:aws:iam::998882071456:user/zozomarket-ses-sender "
                                "is not authorized"
                            ),
                        }
                    },
                    name,
                )

            return _raise

    monkeypatch.setattr("boto3.client", lambda service, **kwargs: DeniedClient())
    res = provision_aws_infrastructure("AKIA...", "SECRET...", "ap-southeast-2")
    assert res.configuration_set == "zozomarket-tracking"
    assert (
        res.sqs_queue_url
        == "https://sqs.ap-southeast-2.amazonaws.com/998882071456/zozomarket-ses-events-queue"
    )
    assert res.warnings == []
