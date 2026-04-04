"""
Startup seeders — create system roles if they don't exist.
System roles are protected from editing and deletion.
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
