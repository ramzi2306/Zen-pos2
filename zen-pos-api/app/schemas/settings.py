from typing import Any, Optional
from pydantic import BaseModel


class BrandingUpdate(BaseModel):
    restaurant_name: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    accent_color: Optional[str] = None
    compact_layout: Optional[bool] = None
    show_itemized_tax: Optional[bool] = None
    print_qr_code: Optional[bool] = None
    footer_text: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    daily_special: Optional[str] = None


class BrandingOut(BaseModel):
    restaurant_name: str
    primary_color: str
    secondary_color: str
    accent_color: str
    compact_layout: bool
    show_itemized_tax: bool
    print_qr_code: bool
    footer_text: str
    phone: str
    email: str
    address: str
    daily_special: str = ""


class LocalizationUpdate(BaseModel):
    language: Optional[str] = None
    currency: Optional[str] = None
    currency_position: Optional[str] = None
    country: Optional[str] = None
    tax_enabled: Optional[bool] = None
    tax_rate: Optional[float] = None
    timezone: Optional[str] = None


class LocalizationOut(BaseModel):
    language: str
    currency: str
    currency_position: str
    country: str
    tax_enabled: bool
    tax_rate: float
    timezone: str


class IntegrationUpdate(BaseModel):
    telegram_enabled: Optional[bool] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_reports: Optional[dict[str, Any]] = None
    email_enabled: Optional[bool] = None
    email_recipients: Optional[str] = None
    email_service: Optional[str] = None
    email_host: Optional[str] = None
    email_port: Optional[str] = None
    email_user: Optional[str] = None
    email_password: Optional[str] = None
    email_reports: Optional[dict[str, Any]] = None


class IntegrationOut(BaseModel):
    telegram_enabled: bool
    telegram_bot_token: str
    telegram_chat_id: str
    telegram_reports: dict[str, Any]
    email_enabled: bool
    email_recipients: str
    email_service: str
    email_host: str
    email_port: str
    email_user: str
    email_password: str
    email_reports: dict[str, Any]
