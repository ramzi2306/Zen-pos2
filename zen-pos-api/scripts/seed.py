"""
Seed script — populates MongoDB with ZEN-POS initial data.

Usage:
    python -m scripts.seed

Requires a running MongoDB instance and a valid .env file.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import connect_db, disconnect_db
from app.models.user import UserDocument, RoleDocument
from app.models.product import ProductDocument, CategoryDocument
from app.models.ingredient import IngredientInventoryDocument
from app.core.security import hash_password


ROLES = [
    {"name": "Super Admin", "permissions": [
        "view_menu", "view_orders", "view_attendance", "view_staff",
        "view_hr", "view_inventory", "view_settings", "manage_roles",
    ]},
    {"name": "HR Manager",          "permissions": ["view_staff", "view_hr"]},
    {"name": "Attendance Manager",  "permissions": ["view_attendance"]},
    {"name": "Cashier",             "permissions": ["view_menu", "view_orders"]},
    {"name": "Cook",                "permissions": ["view_orders"]},
]

CATEGORIES = ["Nigiri", "Sashimi", "Sake", "Specials", "Rolls"]

PRODUCTS = [
    {
        "name": "Bluefin Otoro Nigiri",
        "description": "Premium fatty tuna, lightly seasoned with aged soy",
        "price": 28.0,
        "category": "Nigiri",
        "image": "https://images.unsplash.com/photo-1617196034099-2079d649d4bf?w=400",
        "in_stock": True,
        "stock_level": "Healthy",
        "tags": ["Chef Choice"],
    },
    {
        "name": "Sake Aburi",
        "description": "Flame-seared salmon with ponzu glaze",
        "price": 18.0,
        "category": "Nigiri",
        "image": "https://images.unsplash.com/photo-1559410545-0bdcd187e0a6?w=400",
        "in_stock": True,
        "stock_level": "Healthy",
        "tags": [],
    },
    {
        "name": "Hamachi Jalapeño",
        "description": "Yellowtail with fresh jalapeño and yuzu citrus",
        "price": 22.0,
        "category": "Sashimi",
        "image": "https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=400",
        "in_stock": True,
        "stock_level": "Low",
        "tags": ["Chef Choice"],
    },
    {
        "name": "Hokkaido Uni",
        "description": "Sea urchin from Hokkaido, served on shiso leaf",
        "price": 35.0,
        "category": "Specials",
        "image": "https://images.unsplash.com/photo-1534482421-64566f976cfa?w=400",
        "in_stock": False,
        "stock_level": "Critical",
        "tags": ["Chef Choice"],
    },
    {
        "name": "Kubota Manju",
        "description": "Premium junmai daiginjo sake, floral and crisp",
        "price": 24.0,
        "category": "Sake",
        "image": "https://images.unsplash.com/photo-1571167583619-b0a7fdf5a8da?w=400",
        "in_stock": True,
        "stock_level": "Healthy",
        "tags": [],
    },
    {
        "name": "Spicy Tuna Roll",
        "description": "Classic spicy tuna roll with cucumber and avocado",
        "price": 16.0,
        "category": "Rolls",
        "image": "https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=400",
        "in_stock": True,
        "stock_level": "Healthy",
        "tags": [],
        "variations": [
            {
                "id": "vg_size",
                "name": "Size",
                "options": [
                    {"id": "vo_4pc", "name": "4 pieces", "price_adjustment": 0},
                    {"id": "vo_8pc", "name": "8 pieces", "price_adjustment": 8.0},
                ],
            },
            {
                "id": "vg_filling",
                "name": "Filling",
                "options": [
                    {"id": "vo_tuna", "name": "Tuna", "price_adjustment": 0},
                    {"id": "vo_salmon", "name": "Salmon", "price_adjustment": 0},
                    {"id": "vo_surimi", "name": "Surimi", "price_adjustment": -2.0},
                ],
            },
        ],
    },
]

USERS = [
    {
        "name": "Kenji Sato",
        "email": "admin@zenpos.com",
        "password": "admin",
        "pin": "1234",
        "phone": "+1 555-0101",
        "role_name": "Super Admin",
        "base_salary": 5000,
        "image": "https://i.pravatar.cc/150?img=11",
        "start_date": "2021-04-01",
        "contract_type": "Full-time Permanent",
        "contract_date": "2021-04-01",
    },
    {
        "name": "Miki Izumi",
        "email": "miki@omakase.com",
        "password": "password",
        "pin": "2222",
        "phone": "+1 555-0102",
        "role_name": "HR Manager",
        "base_salary": 4000,
        "image": "https://i.pravatar.cc/150?img=47",
        "start_date": "2022-01-15",
        "contract_type": "Full-time Permanent",
        "contract_date": "2022-01-15",
    },
    {
        "name": "Takashi Morita",
        "email": "tmorita@omakase.com",
        "password": "password",
        "pin": "3333",
        "phone": "+1 555-0103",
        "role_name": "Cashier",
        "base_salary": 3000,
        "image": "https://i.pravatar.cc/150?img=59",
        "start_date": "2022-06-01",
        "contract_type": "Full-time Permanent",
        "contract_date": "2022-06-01",
    },
    {
        "name": "Yui Tanaka",
        "email": "ytanaka@omakase.com",
        "password": "password",
        "pin": "4444",
        "phone": "+1 555-0104",
        "role_name": "Cook",
        "base_salary": 3500,
        "image": "https://i.pravatar.cc/150?img=25",
        "start_date": "2022-03-15",
        "contract_type": "Full-time Permanent",
        "contract_date": "2022-03-15",
    },
]

INGREDIENTS = [
    {"name": "Bluefin Tuna (Akami)", "sku": "SF-TUNA-01", "category": ["PREMIUM", "SEAFOOD"],
     "unit": "kg", "in_stock": 12.5, "capacity": 20.0, "price_per_unit": 124.0, "icon": "sushi"},
    {"name": "Koshihikari Rice", "sku": "GR-RICE-01", "category": ["GRAINS"],
     "unit": "kg", "in_stock": 4.2, "capacity": 50.0, "price_per_unit": 8.5, "icon": "rice_bowl"},
    {"name": "Miyazaki Wagyu A5", "sku": "MT-WAGY-01", "category": ["PREMIUM", "MEAT"],
     "unit": "kg", "in_stock": 8.0, "capacity": 15.0, "price_per_unit": 320.0, "icon": "restaurant"},
    {"name": "Hokkaido Scallops", "sku": "SF-SCAL-01", "category": ["SEAFOOD"],
     "unit": "kg", "in_stock": 2.5, "capacity": 10.0, "price_per_unit": 85.0, "icon": "set_meal"},
    {"name": "Nori Sheets", "sku": "DR-NORI-01", "category": ["DRY GOODS"],
     "unit": "pack", "in_stock": 30.0, "capacity": 100.0, "price_per_unit": 4.5, "icon": "inventory_2"},
    {"name": "Japanese Sake", "sku": "BV-SAKE-01", "category": ["BEVERAGES"],
     "unit": "L", "in_stock": 25.0, "capacity": 50.0, "price_per_unit": 18.0, "icon": "local_bar"},
]


async def seed():
    print("Connecting to MongoDB...")
    await connect_db()

    # ── Roles ──────────────────────────────────────────────
    print("Seeding roles...")
    role_map: dict[str, RoleDocument] = {}
    for r in ROLES:
        existing = await RoleDocument.find_one(RoleDocument.name == r["name"])
        if existing:
            role_map[r["name"]] = existing
            print(f"  Role '{r['name']}' already exists, skipping.")
        else:
            doc = RoleDocument(name=r["name"], permissions=r["permissions"])
            await doc.insert()
            role_map[r["name"]] = doc
            print(f"  Created role: {r['name']}")

    # ── Categories ─────────────────────────────────────────
    print("Seeding categories...")
    for name in CATEGORIES:
        existing = await CategoryDocument.find_one(CategoryDocument.name == name)
        if not existing:
            await CategoryDocument(name=name).insert()
            print(f"  Created category: {name}")

    # ── Products ───────────────────────────────────────────
    print("Seeding products...")
    for p in PRODUCTS:
        existing = await ProductDocument.find_one(ProductDocument.name == p["name"])
        if not existing:
            # Convert variations to proper format for Beanie
            raw_vars = p.pop("variations", [])
            doc = ProductDocument(**p)
            if raw_vars:
                from app.models.product import VariationGroup, VariationOption
                doc.variations = [
                    VariationGroup(
                        id=vg["id"],
                        name=vg["name"],
                        options=[
                            VariationOption(
                                id=vo["id"],
                                name=vo["name"],
                                price_adjustment=vo.get("price_adjustment", 0),
                            )
                            for vo in vg["options"]
                        ],
                    )
                    for vg in raw_vars
                ]
            await doc.insert()
            print(f"  Created product: {p['name']}")

    # ── Users ──────────────────────────────────────────────
    print("Seeding users...")
    for u in USERS:
        existing = await UserDocument.find_one(UserDocument.email == u["email"])
        if existing:
            print(f"  User '{u['email']}' already exists, skipping.")
            continue
        role = role_map[u["role_name"]]
        doc = UserDocument(
            name=u["name"],
            email=u["email"],
            hashed_password=hash_password(u["password"]),
            hashed_pin=hash_password(u["pin"]),
            phone=u["phone"],
            role=role,
            base_salary=u["base_salary"],
            image=u["image"],
            start_date=u.get("start_date", ""),
            contract_type=u.get("contract_type", ""),
            contract_date=u.get("contract_date", ""),
        )
        await doc.insert()
        print(f"  Created user: {u['name']} ({u['email']})")

    # ── Ingredients ────────────────────────────────────────
    print("Seeding ingredients...")
    for ing in INGREDIENTS:
        existing = await IngredientInventoryDocument.find_one(
            IngredientInventoryDocument.name == ing["name"]
        )
        if not existing:
            await IngredientInventoryDocument(**ing).insert()
            print(f"  Created ingredient: {ing['name']}")

    print("\nSeed complete!")
    print("\nCredentials:")
    for u in USERS:
        print(f"  {u['email']} / {u['password']} (PIN: {u['pin']})")

    await disconnect_db()


if __name__ == "__main__":
    asyncio.run(seed())
