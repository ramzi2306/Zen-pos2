from datetime import datetime, timezone
from beanie import Document
from pydantic import Field
from pymongo import IndexModel, ASCENDING


class LocationDocument(Document):
    name: str
    subtitle: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    tables_count: int = 0
    bar_count: int = 0
    opening_time: str = ""
    closing_time: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "locations"
        indexes = [IndexModel([("name", ASCENDING)])]
