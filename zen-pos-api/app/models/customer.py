from typing import Optional
from datetime import datetime, timezone

from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING


class CustomerDocument(Document):
    name: str
    phone: str
    address: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "customers"
        indexes = [
            IndexModel([("phone", ASCENDING)], unique=True),
        ]


class CustomerSessionDocument(Document):
    token: str
    phone: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "customer_sessions"
        indexes = [
            IndexModel([("token", ASCENDING)], unique=True),
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),
        ]
