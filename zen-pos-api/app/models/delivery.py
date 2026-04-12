from typing import Optional
from datetime import datetime, timezone

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import IndexModel, ASCENDING


class DeliveryPlaceDocument(Document):
    name: str                                 # municipality / neighbourhood name
    wilaya: str = ""                          # parent region / state (optional)
    delivery_fee: float = 0                   # optional zone-based delivery fee
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "delivery_places"
        indexes = [
            IndexModel([("name", ASCENDING)]),
            IndexModel([("is_active", ASCENDING)]),
        ]


class DeliveryAgentDocument(Document):
    name: str
    phone: str
    vehicle_type: str = ""                    # e.g. "Motorcycle", "Car"
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "delivery_agents"
        indexes = [
            IndexModel([("name", ASCENDING)]),
            IndexModel([("is_active", ASCENDING)]),
        ]


class DeliveryAgentInfo(BaseModel):
    """Embedded sub-document stored on OrderDocument when an agent is assigned."""
    agent_id: str
    name: str
    phone: str
