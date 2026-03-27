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
