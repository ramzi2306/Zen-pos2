from typing import Any, Optional
from pydantic import BaseModel


class BrandingUpdate(BaseModel):
    restaurant_name: Optional[str] = None
    meta_title: Optional[str] = None
    logo: Optional[str] = None
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
    public_menu_card_layout: Optional[str] = None  # "vertical" | "horizontal"
    tracking_image: Optional[str] = None
    opening_hours: Optional[dict] = None


class BrandingOut(BaseModel):
    restaurant_name: str
    meta_title: str = ""
    logo: str = ""
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
    public_menu_card_layout: str = "vertical"
    tracking_image: str = ""
    opening_hours: dict = {}


class LocalizationUpdate(BaseModel):
    language: Optional[str] = None
    currency: Optional[str] = None
    currency_position: Optional[str] = None
    country: Optional[str] = None
    tax_enabled: Optional[bool] = None
    tax_rate: Optional[float] = None
    timezone: Optional[str] = None
    decimal_separator: Optional[str] = None
    currency_decimals: Optional[int] = None
    gratuity_enabled: Optional[bool] = None
    gratuity_rate: Optional[float] = None


class LocalizationOut(BaseModel):
    language: str
    currency: str
    currency_position: str
    country: str
    tax_enabled: bool
    tax_rate: float
    timezone: str
    decimal_separator: str
    currency_decimals: int
    gratuity_enabled: bool = False
    gratuity_rate: float = 0.0


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
    firebase_enabled: Optional[bool] = None
    firebase_api_key: Optional[str] = None
    firebase_auth_domain: Optional[str] = None
    firebase_project_id: Optional[str] = None
    firebase_storage_bucket: Optional[str] = None
    firebase_messaging_sender_id: Optional[str] = None
    firebase_app_id: Optional[str] = None
    firebase_measurement_id: Optional[str] = None
    bunny_enabled: Optional[bool] = None
    bunny_api_key: Optional[str] = None
    bunny_storage_zone: Optional[str] = None
    bunny_storage_region: Optional[str] = None
    bunny_cdn_hostname: Optional[str] = None
    bunny_pull_zone_id: Optional[str] = None
    meta_pixel_enabled: Optional[bool] = None
    meta_pixel_id: Optional[str] = None
    meta_capi_enabled: Optional[bool] = None
    meta_capi_token: Optional[str] = None
    meta_capi_test_event_code: Optional[str] = None


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
    firebase_enabled: bool
    firebase_api_key: str
    firebase_auth_domain: str
    firebase_project_id: str
    firebase_storage_bucket: str
    firebase_messaging_sender_id: str
    firebase_app_id: str
    firebase_measurement_id: str
    bunny_enabled: bool
    bunny_api_key: str
    bunny_storage_zone: str
    bunny_storage_region: str
    bunny_cdn_hostname: str
    bunny_pull_zone_id: str
    meta_pixel_enabled: bool
    meta_pixel_id: str
    meta_capi_enabled: bool
    meta_capi_token: str
    meta_capi_test_event_code: str
