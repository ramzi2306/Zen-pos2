"""
Startup seeders — create system roles and default settings documents if they
don't exist yet.  All functions are idempotent: they never overwrite existing
data, so redeploying the application will never reset saved settings.
"""
from app.models.user import RoleDocument

# These roles are always present in the system and cannot be modified via the API.
SYSTEM_ROLES = [
    {
        "name": "Super Admin",
        "permissions": [
            "view_menu", "view_orders", "view_attendance", "view_staff",
            "view_hr", "view_settings", "view_inventory", "manage_roles",
        ],
        "exclude_from_attendance": True,
        "is_system": True,
    },
    {
        "name": "Attendance Manager",
        "permissions": ["view_attendance"],
        "exclude_from_attendance": True,  # The role itself doesn't clock in
        "is_system": True,
    },
]


async def seed_system_roles() -> None:
    """Idempotent: create system roles that don't yet exist in the DB."""
    for role_data in SYSTEM_ROLES:
        existing = await RoleDocument.find_one(RoleDocument.name == role_data["name"])
        if existing:
            # Ensure is_system flag is set in case of legacy data
            if not existing.is_system:
                existing.is_system = True
                await existing.save()
        else:
            role = RoleDocument(**role_data)
            await role.insert()


async def seed_settings() -> None:
    """
    Idempotent: ensure branding, localization, and integration documents exist.

    This runs at every startup so the documents are always present before the
    first API request arrives.  If a document already exists it is NEVER
    modified — saved settings survive redeployment.
    """
    import logging
    from pymongo.errors import DuplicateKeyError
    from app.models.settings import BrandingDocument, LocalizationDocument, IntegrationDocument

    log = logging.getLogger(__name__)

    for DocClass, key in [
        (BrandingDocument,     "branding"),
        (LocalizationDocument, "localization"),
        (IntegrationDocument,  "integration"),
    ]:
        try:
            existing = await DocClass.find_one(DocClass.key == key)  # type: ignore[attr-defined]
            if existing is None:
                doc = DocClass()
                await doc.insert()
                log.info("Created default %s document", key)
            else:
                log.info("Found existing %s document (id=%s)", key, existing.id)
        except DuplicateKeyError:
            # Another worker beat us to the insert — that's fine.
            pass
        except Exception as exc:
            # Log but don't crash startup; settings will be created on first request.
            log.warning("Could not seed %s document: %s", key, exc)
