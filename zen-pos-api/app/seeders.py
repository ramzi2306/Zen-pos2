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
            # POS Operations
            "view_menu", "view_orders", "apply_discounts", "cancel_completed_order",
            # Administration
            "view_settings", "manage_roles", "manage_locations",
            # Products & Inventory
            "manage_menu", "view_inventory", "manage_inventory",
            # Staff & HR
            "view_staff", "manage_staff", "view_hr", "manage_payroll", "manage_withdrawals",
            # Reports
            "view_reports", "view_attendance",
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
            changed = False
            if not existing.is_system:
                existing.is_system = True
                changed = True
            # Always sync permissions so new permissions land on restart
            if existing.permissions != role_data["permissions"]:
                existing.permissions = role_data["permissions"]
                changed = True
            if changed:
                await existing.save()
        else:
            role = RoleDocument(**role_data)
            await role.insert()


async def seed_settings() -> None:
    """
    Idempotent: ensure branding, localization, and integration documents exist.

    Each settings type now lives in its own collection (branding / localization /
    integration) to avoid Beanie v1.27+ _class_id discriminator interference.

    On first startup after the migration, existing rows are copied from the old
    shared 'settings' collection into their new dedicated collections so that
    saved settings are never lost.
    """
    import logging
    from pymongo.errors import DuplicateKeyError
    from app.models.settings import BrandingDocument, LocalizationDocument, IntegrationDocument

    log = logging.getLogger(__name__)

    PAIRS = [
        (BrandingDocument,     "branding"),
        (LocalizationDocument, "localization"),
        (IntegrationDocument,  "integration"),
    ]

    # ── One-time migration from the old shared 'settings' collection ──────────
    # Previous versions stored all three document types in one MongoDB collection
    # called 'settings'.  Beanie 1.27+ adds a _class_id discriminator to every
    # query when multiple models share a collection, so legacy documents (without
    # that field) would never be found — causing an apparent reset on every
    # deploy.  We now give each type its own collection; this block migrates any
    # surviving rows across on the first startup after the change.
    try:
        db = BrandingDocument.get_motor_collection().database
        old_col = db["settings"]

        for DocClass, key in PAIRS:
            # Skip if the dedicated collection already has this document
            if await DocClass.find_one(DocClass.key == key) is not None:  # type: ignore[attr-defined]
                continue

            # Look in the old shared collection (raw motor — no _class_id filter)
            raw = await old_col.find_one({"key": key})
            if raw is None:
                continue  # Nothing to migrate; defaults are created below

            raw.pop("_id", None)
            raw.pop("_class_id", None)

            try:
                doc = DocClass.model_validate(raw)
                await doc.insert()
                log.info("Migrated '%s' settings from shared collection → '%s'",
                         key, DocClass.Settings.name)
            except Exception as exc:
                log.warning("Could not migrate '%s' settings: %s", key, exc)

    except Exception as exc:
        log.warning("Settings migration check failed: %s", exc)

    # ── Ensure each dedicated-collection document exists ──────────────────────
    for DocClass, key in PAIRS:
        try:
            existing = await DocClass.find_one(DocClass.key == key)  # type: ignore[attr-defined]
            if existing is None:
                doc = DocClass()
                await doc.insert()
                log.info("Created default %s document", key)
            else:
                log.info("Found existing %s document (id=%s)", key, existing.id)
        except DuplicateKeyError:
            pass
        except Exception as exc:
            log.warning("Could not seed %s document: %s", key, exc)
