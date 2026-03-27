from datetime import datetime

from beanie import Document, Link
from pymongo import IndexModel, ASCENDING

from app.models.user import UserDocument


class RefreshTokenDocument(Document):
    user: Link[UserDocument]
    token: str                                 # stored as plain JWT (sign is the secret)
    expires_at: datetime
    revoked: bool = False

    class Settings:
        name = "refresh_tokens"
        indexes = [
            IndexModel([("user.$id", ASCENDING)]),
            IndexModel([("expires_at", ASCENDING)], expireAfterSeconds=0),  # TTL index
        ]
