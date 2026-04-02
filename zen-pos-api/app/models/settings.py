from typing import Any
from beanie import Document
from pymongo import IndexModel, ASCENDING


class BrandingDocument(Document):
    key: str = "branding"
    restaurant_name: str = "Omakase POS"
    meta_title: str = ""
    logo: str = ""
    primary_color: str = "#C0C7D4"
    secondary_color: str = "#FFB4A5"
    accent_color: str = "#9DD761"
    compact_layout: bool = True
    show_itemized_tax: bool = True
    print_qr_code: bool = False
    footer_text: str = "Thank you for dining with us"
    phone: str = ""
    email: str = ""
    address: str = ""
    daily_special: str = ""

    class Settings:
        name = "settings"
        indexes = [
            IndexModel([("key", ASCENDING)], unique=True),
        ]


class LocalizationDocument(Document):
    key: str = "localization"
    language: str = "English"
    currency: str = "DZD"
    currency_position: str = "right"
    country: str = "Algeria"
    tax_enabled: bool = True
    tax_rate: float = 8.0
    timezone: str = "Africa/Algiers"

    class Settings:
        name = "settings"
        indexes = [
            IndexModel([("key", ASCENDING)], unique=True),
        ]


class IntegrationDocument(Document):
    key: str = "integration"
    telegram_enabled: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    telegram_reports: dict[str, Any] = {}
    email_enabled: bool = False
    email_recipients: str = ""
    email_service: str = "smtp"
    email_host: str = ""
    email_port: str = "587"
    email_user: str = ""
    email_password: str = ""
    email_reports: dict[str, Any] = {}
    firebase_enabled: bool = False
    firebase_api_key: str = ""
    firebase_auth_domain: str = ""
    firebase_project_id: str = ""
    firebase_storage_bucket: str = ""
    firebase_messaging_sender_id: str = ""
    firebase_app_id: str = ""
    firebase_measurement_id: str = ""
    bunny_enabled: bool = False
    bunny_api_key: str = ""
    bunny_storage_zone: str = ""
    bunny_storage_region: str = ""
    bunny_cdn_hostname: str = ""
    bunny_pull_zone_id: str = ""

    class Settings:
        name = "settings"
        indexes = [
            IndexModel([("key", ASCENDING)], unique=True),
        ]
