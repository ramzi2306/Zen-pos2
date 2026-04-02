from datetime import datetime, timezone, timedelta

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING


class OTPDocument(Document):
    phone: str
    otp: str
    session_info: str = ""          # Firebase sessionInfo if SMS was sent via Firebase
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(minutes=5)
    )

    class Settings:
        name = "otps"
        indexes = [
            IndexModel([("phone", ASCENDING)], unique=True),
            # MongoDB auto-deletes documents once expires_at is past
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),
        ]
