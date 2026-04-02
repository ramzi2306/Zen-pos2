from __future__ import annotations
from typing import Optional
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

# Import all document models here so Beanie registers them
from app.models.user import UserDocument, RoleDocument
from app.models.product import ProductDocument, CategoryDocument
from app.models.order import OrderDocument
from app.models.attendance import AttendanceRecordDocument
from app.models.payroll import PayrollWithdrawalDocument, PerformanceLogDocument
from app.models.token import RefreshTokenDocument
from app.models.ingredient import IngredientInventoryDocument, PurchaseLogDocument, UsageLogDocument
from app.models.customer import CustomerDocument, CustomerSessionDocument
from app.models.settings import BrandingDocument, LocalizationDocument, IntegrationDocument
from app.models.location import LocationDocument
from app.models.otp import OTPDocument

_client: Optional[AsyncIOMotorClient] = None
_initialized: bool = False


async def connect_db() -> None:
    global _client, _initialized
    if _initialized:
        return  # Already initialized (e.g. by test fixtures — skip to avoid loop mismatch)
    _initialized = True
    _client = AsyncIOMotorClient(settings.mongo_url, tz_aware=True)
    await init_beanie(
        database=_client[settings.mongo_db_name],
        document_models=[
            RoleDocument,
            UserDocument,
            CategoryDocument,
            ProductDocument,
            OrderDocument,
            AttendanceRecordDocument,
            PayrollWithdrawalDocument,
            PerformanceLogDocument,
            RefreshTokenDocument,
            IngredientInventoryDocument,
            PurchaseLogDocument,
            UsageLogDocument,
            CustomerDocument,
            CustomerSessionDocument,
            BrandingDocument,
            LocalizationDocument,
            IntegrationDocument,
            LocationDocument,
            OTPDocument,
        ],
    )


async def disconnect_db() -> None:
    if _client:
        _client.close()
