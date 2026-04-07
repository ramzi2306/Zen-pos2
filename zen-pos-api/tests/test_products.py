"""
Product workflow integration tests — covers every bug fixed in the product pipeline.

Groups:
  A. Basic CRUD (pre-existing, kept)
  B. Ingredients round-trip (BUG-02/03/04)
  C. in_stock toggle (BUG-07)
  D. Variations and price structure
  E. Supplements and price_adjustment
  F. Upload auth guard (BUG-06)
  G. Public menu endpoint
  H. Edge cases (base64 rejection, soft-delete visibility, images endpoint)
"""

import io
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio(loop_scope="session")

# ── Shared fixtures ───────────────────────────────────────────────────────────

_BASE_PRODUCT = {
    "name": "Test Tuna Roll",
    "description": "Fresh tuna",
    "price": 18.0,
    "category": "Rolls",
    "in_stock": True,
}

_PRODUCT_WITH_INGREDIENTS = {
    "name": "Ingredient Roll",
    "description": "Has base ingredients",
    "price": 20.0,
    "category": "Rolls",
    "in_stock": True,
    "ingredients": [
        {"id": "ing-1", "name": "Tuna", "amount": 100.0, "unit": "g", "waste_percent": 5.0},
        {"id": "ing-2", "name": "Rice",  "amount": 200.0, "unit": "g", "waste_percent": None},
    ],
}

_PRODUCT_WITH_VARIATIONS = {
    "name": "Size Roll",
    "description": "Has size variations",
    "price": 0.0,
    "category": "Rolls",
    "in_stock": True,
    "variations": [
        {
            "id": "vg-1",
            "name": "Size",
            "options": [
                {"id": "vo-1", "name": "Small",  "price": 10.0, "ingredients": []},
                {"id": "vo-2", "name": "Medium", "price": 14.0, "ingredients": []},
                {"id": "vo-3", "name": "Large",  "price": 18.0, "ingredients": []},
            ],
        }
    ],
}

_PRODUCT_WITH_SUPPLEMENTS = {
    "name": "Extra Roll",
    "description": "Has supplements",
    "price": 12.0,
    "category": "Rolls",
    "in_stock": True,
    "supplements": [
        {
            "id": "sg-1",
            "name": "Extras",
            "options": [
                {"id": "so-1", "name": "Extra Avocado", "price_adjustment": 2.5, "ingredients": []},
                {"id": "so-2", "name": "Extra Sauce",   "price_adjustment": 0.5, "ingredients": []},
            ],
        }
    ],
}

_AUTH = lambda token: {"Authorization": f"Bearer {token}"}


# ═══════════════════════════════════════════════════════════════════════════════
# A. Basic CRUD
# ═══════════════════════════════════════════════════════════════════════════════

async def test_list_products_public(client: AsyncClient):
    """Product listing requires no auth."""
    r = await client.get("/products/")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_categories_public(client: AsyncClient):
    r = await client.get("/products/categories")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_create_product_requires_auth(client: AsyncClient):
    r = await client.post("/products/", json=_BASE_PRODUCT)
    assert r.status_code == 401


async def test_create_product(client: AsyncClient, admin_token: str):
    r = await client.post("/products/", headers=_AUTH(admin_token), json=_BASE_PRODUCT)
    assert r.status_code == 201
    d = r.json()
    assert d["name"] == "Test Tuna Roll"
    assert d["price"] == 18.0
    assert d["in_stock"] is True
    assert "id" in d


async def test_get_product(client: AsyncClient, admin_token: str):
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_BASE_PRODUCT)
    pid = create.json()["id"]
    r = await client.get(f"/products/{pid}")
    assert r.status_code == 200
    assert r.json()["id"] == pid


async def test_product_not_found(client: AsyncClient):
    r = await client.get("/products/000000000000000000000000")
    assert r.status_code == 404


async def test_update_product(client: AsyncClient, admin_token: str):
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_BASE_PRODUCT)
    pid = create.json()["id"]
    r = await client.patch(
        f"/products/{pid}", headers=_AUTH(admin_token),
        json={"price": 22.0, "in_stock": False},
    )
    assert r.status_code == 200
    assert r.json()["price"] == 22.0
    assert r.json()["in_stock"] is False


async def test_delete_product_soft(client: AsyncClient, admin_token: str):
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_BASE_PRODUCT)
    pid = create.json()["id"]
    delete = await client.delete(f"/products/{pid}", headers=_AUTH(admin_token))
    assert delete.status_code == 204
    # Soft-delete: gone from active list
    listing = await client.get("/products/")
    ids = [p["id"] for p in listing.json()]
    assert pid not in ids


async def test_create_category(client: AsyncClient, admin_token: str):
    r = await client.post(
        "/products/categories", headers=_AUTH(admin_token),
        json={"name": "Test Category XYZ"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Test Category XYZ"


# ═══════════════════════════════════════════════════════════════════════════════
# B. Ingredients round-trip  (BUG-02 / BUG-03 / BUG-04)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_create_product_with_ingredients_returned(client: AsyncClient, admin_token: str):
    """ProductOut must include the ingredients that were saved (BUG-03 fix)."""
    r = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_INGREDIENTS)
    assert r.status_code == 201
    d = r.json()
    assert "ingredients" in d, "ProductOut must contain 'ingredients' field"
    assert len(d["ingredients"]) == 2
    names = {i["name"] for i in d["ingredients"]}
    assert names == {"Tuna", "Rice"}


async def test_create_product_ingredients_fields(client: AsyncClient, admin_token: str):
    """Each ingredient must carry id, name, amount, unit and waste_percent."""
    r = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_INGREDIENTS)
    assert r.status_code == 201
    ing = next(i for i in r.json()["ingredients"] if i["name"] == "Tuna")
    assert ing["amount"] == 100.0
    assert ing["unit"] == "g"
    assert ing["waste_percent"] == 5.0


async def test_get_product_returns_ingredients(client: AsyncClient, admin_token: str):
    """GET /products/{id} returns ingredients (BUG-03 fix)."""
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_INGREDIENTS)
    pid = create.json()["id"]
    r = await client.get(f"/products/{pid}")
    assert r.status_code == 200
    assert len(r.json()["ingredients"]) == 2


async def test_list_products_returns_ingredients(client: AsyncClient, admin_token: str):
    """GET /products/ list also returns ingredients for each product."""
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_INGREDIENTS)
    pid = create.json()["id"]
    listing = await client.get("/products/")
    product = next((p for p in listing.json() if p["id"] == pid), None)
    assert product is not None
    assert "ingredients" in product
    assert len(product["ingredients"]) == 2


async def test_patch_updates_ingredients(client: AsyncClient, admin_token: str):
    """PATCH /products/{id} can add/replace base ingredients (BUG-04 fix)."""
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_INGREDIENTS)
    pid = create.json()["id"]

    new_ings = [
        {"id": "ing-99", "name": "Salmon", "amount": 80.0, "unit": "g", "waste_percent": 3.0},
    ]
    r = await client.patch(
        f"/products/{pid}", headers=_AUTH(admin_token),
        json={"ingredients": new_ings},
    )
    assert r.status_code == 200
    ings = r.json()["ingredients"]
    assert len(ings) == 1
    assert ings[0]["name"] == "Salmon"


async def test_patch_clear_ingredients(client: AsyncClient, admin_token: str):
    """Sending empty ingredients list clears all base ingredients."""
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_INGREDIENTS)
    pid = create.json()["id"]
    r = await client.patch(
        f"/products/{pid}", headers=_AUTH(admin_token),
        json={"ingredients": []},
    )
    assert r.status_code == 200
    assert r.json()["ingredients"] == []


async def test_patch_does_not_touch_ingredients_when_omitted(client: AsyncClient, admin_token: str):
    """A PATCH that omits 'ingredients' must leave existing ingredients intact."""
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_INGREDIENTS)
    pid = create.json()["id"]

    # Update only the price — ingredients must survive
    r = await client.patch(
        f"/products/{pid}", headers=_AUTH(admin_token),
        json={"price": 25.0},
    )
    assert r.status_code == 200
    assert r.json()["price"] == 25.0
    assert len(r.json()["ingredients"]) == 2, "Ingredients must not be cleared by an unrelated PATCH"


# ═══════════════════════════════════════════════════════════════════════════════
# C. in_stock toggle  (BUG-07)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_create_product_default_in_stock_true(client: AsyncClient, admin_token: str):
    payload = {**_BASE_PRODUCT, "name": "Stock Default Product"}
    del payload["in_stock"]  # omit field → should default to True
    r = await client.post("/products/", headers=_AUTH(admin_token), json=payload)
    assert r.status_code == 201
    assert r.json()["in_stock"] is True


async def test_patch_set_out_of_stock(client: AsyncClient, admin_token: str):
    create = await client.post(
        "/products/", headers=_AUTH(admin_token),
        json={**_BASE_PRODUCT, "name": "Will Be Out Of Stock"},
    )
    pid = create.json()["id"]
    r = await client.patch(f"/products/{pid}", headers=_AUTH(admin_token), json={"in_stock": False})
    assert r.status_code == 200
    assert r.json()["in_stock"] is False


async def test_patch_restore_in_stock(client: AsyncClient, admin_token: str):
    create = await client.post(
        "/products/", headers=_AUTH(admin_token),
        json={**_BASE_PRODUCT, "name": "Restore Stock Product", "in_stock": False},
    )
    pid = create.json()["id"]
    r = await client.patch(f"/products/{pid}", headers=_AUTH(admin_token), json={"in_stock": True})
    assert r.status_code == 200
    assert r.json()["in_stock"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# D. Variations and price structure
# ═══════════════════════════════════════════════════════════════════════════════

async def test_create_product_with_variations(client: AsyncClient, admin_token: str):
    r = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_VARIATIONS)
    assert r.status_code == 201
    d = r.json()
    assert len(d["variations"]) == 1
    vg = d["variations"][0]
    assert vg["name"] == "Size"
    assert len(vg["options"]) == 3


async def test_variation_options_carry_price(client: AsyncClient, admin_token: str):
    r = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_VARIATIONS)
    d = r.json()
    prices = {o["name"]: o["price"] for o in d["variations"][0]["options"]}
    assert prices["Small"]  == 10.0
    assert prices["Medium"] == 14.0
    assert prices["Large"]  == 18.0


async def test_patch_update_variation_price(client: AsyncClient, admin_token: str):
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_VARIATIONS)
    pid = create.json()["id"]
    updated_variations = [
        {
            "id": "vg-1",
            "name": "Size",
            "options": [
                {"id": "vo-1", "name": "Small",  "price": 11.0, "ingredients": []},
                {"id": "vo-2", "name": "Medium", "price": 15.0, "ingredients": []},
                {"id": "vo-3", "name": "Large",  "price": 20.0, "ingredients": []},
            ],
        }
    ]
    r = await client.patch(
        f"/products/{pid}", headers=_AUTH(admin_token),
        json={"variations": updated_variations},
    )
    assert r.status_code == 200
    prices = {o["name"]: o["price"] for o in r.json()["variations"][0]["options"]}
    assert prices["Small"]  == 11.0
    assert prices["Large"]  == 20.0


async def test_variation_options_can_have_ingredients(client: AsyncClient, admin_token: str):
    payload = {
        **_PRODUCT_WITH_VARIATIONS,
        "name": "Variation Ingredient Roll",
        "variations": [
            {
                "id": "vg-10",
                "name": "Size",
                "options": [
                    {
                        "id": "vo-10", "name": "Large", "price": 15.0,
                        "ingredients": [
                            {"id": "i-1", "name": "Extra Tuna", "amount": 50.0, "unit": "g", "waste_percent": None}
                        ],
                    }
                ],
            }
        ],
    }
    r = await client.post("/products/", headers=_AUTH(admin_token), json=payload)
    assert r.status_code == 201
    opt = r.json()["variations"][0]["options"][0]
    assert len(opt["ingredients"]) == 1
    assert opt["ingredients"][0]["name"] == "Extra Tuna"


# ═══════════════════════════════════════════════════════════════════════════════
# E. Supplements and price_adjustment
# ═══════════════════════════════════════════════════════════════════════════════

async def test_create_product_with_supplements(client: AsyncClient, admin_token: str):
    r = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_SUPPLEMENTS)
    assert r.status_code == 201
    d = r.json()
    assert len(d["supplements"]) == 1
    sg = d["supplements"][0]
    assert sg["name"] == "Extras"
    assert len(sg["options"]) == 2


async def test_supplement_options_carry_price_adjustment(client: AsyncClient, admin_token: str):
    r = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_SUPPLEMENTS)
    d = r.json()
    adjs = {o["name"]: o["price_adjustment"] for o in d["supplements"][0]["options"]}
    assert adjs["Extra Avocado"] == 2.5
    assert adjs["Extra Sauce"]   == 0.5


async def test_patch_update_supplement_price_adjustment(client: AsyncClient, admin_token: str):
    create = await client.post("/products/", headers=_AUTH(admin_token), json=_PRODUCT_WITH_SUPPLEMENTS)
    pid = create.json()["id"]
    r = await client.patch(
        f"/products/{pid}", headers=_AUTH(admin_token),
        json={
            "supplements": [{
                "id": "sg-1", "name": "Extras",
                "options": [
                    {"id": "so-1", "name": "Extra Avocado", "price_adjustment": 3.0, "ingredients": []},
                    {"id": "so-2", "name": "Extra Sauce",   "price_adjustment": 1.0, "ingredients": []},
                ],
            }]
        },
    )
    assert r.status_code == 200
    adjs = {o["name"]: o["price_adjustment"] for o in r.json()["supplements"][0]["options"]}
    assert adjs["Extra Avocado"] == 3.0
    assert adjs["Extra Sauce"]   == 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# F. Upload auth guard  (BUG-06)
# ═══════════════════════════════════════════════════════════════════════════════

async def test_upload_requires_auth(client: AsyncClient):
    """POST /settings/upload must reject unauthenticated requests."""
    fake_file = io.BytesIO(b"fake image bytes")
    r = await client.post(
        "/settings/upload",
        files={"file": ("test.png", fake_file, "image/png")},
    )
    assert r.status_code == 401, (
        f"Upload endpoint must require auth, got {r.status_code}: {r.text}"
    )


async def test_upload_with_auth_reaches_storage_logic(client: AsyncClient, admin_token: str):
    """Authenticated upload should not return 401/403 (may fail on storage, but auth passes)."""
    fake_file = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 16)  # minimal PNG-ish bytes
    r = await client.post(
        "/settings/upload",
        headers=_AUTH(admin_token),
        files={"file": ("test.png", fake_file, "image/png")},
    )
    # Auth passed — either 200 (local save succeeded) or 500 (storage error is OK in test env)
    assert r.status_code not in (401, 403), (
        f"Authenticated upload should pass auth check, got {r.status_code}"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# G. Public menu endpoint
# ═══════════════════════════════════════════════════════════════════════════════

async def _seed_category_and_product(admin_token: str, client: AsyncClient, name: str, category: str):
    # Category creation is idempotent: ignore 409/500 caused by the unique index
    # when the same category name was created by an earlier test in the session.
    await client.post("/products/categories", headers=_AUTH(admin_token), json={"name": category})
    r = await client.post("/products/", headers=_AUTH(admin_token), json={
        "name": name, "description": "desc", "price": 9.99, "category": category, "in_stock": True,
    })
    assert r.status_code == 201, f"Failed to create seed product: {r.text}"
    return r.json()["id"]


async def test_public_menu_returns_active_products(client: AsyncClient, admin_token: str):
    pid = await _seed_category_and_product(admin_token, client, "Public Menu Item", "TestPublicCat")
    r = await client.get("/public/menu")
    assert r.status_code == 200
    all_ids = [p["id"] for cat in r.json() for p in cat["products"]]
    assert pid in all_ids


async def test_public_menu_excludes_deleted_products(client: AsyncClient, admin_token: str):
    pid = await _seed_category_and_product(admin_token, client, "Deleted Public Item", "TestPublicCat")
    await client.delete(f"/products/{pid}", headers=_AUTH(admin_token))
    r = await client.get("/public/menu")
    assert r.status_code == 200
    all_ids = [p["id"] for cat in r.json() for p in cat["products"]]
    assert pid not in all_ids, "Soft-deleted products must not appear on the public menu"


async def test_public_menu_no_auth_required(client: AsyncClient):
    r = await client.get("/public/menu")
    assert r.status_code == 200


async def test_public_menu_includes_variations(client: AsyncClient, admin_token: str):
    await client.post("/products/categories", headers=_AUTH(admin_token), json={"name": "TestVarCat"})
    r = await client.post("/products/", headers=_AUTH(admin_token), json={
        **_PRODUCT_WITH_VARIATIONS,
        "name": "Public Variation Product",
        "category": "TestVarCat",
    })
    pid = r.json()["id"]

    menu = await client.get("/public/menu")
    prod = next(
        (p for cat in menu.json() for p in cat["products"] if p["id"] == pid), None
    )
    assert prod is not None
    assert len(prod["variations"]) == 1
    assert len(prod["variations"][0]["options"]) == 3


async def test_public_menu_includes_supplements(client: AsyncClient, admin_token: str):
    await client.post("/products/categories", headers=_AUTH(admin_token), json={"name": "TestSuppCat"})
    r = await client.post("/products/", headers=_AUTH(admin_token), json={
        **_PRODUCT_WITH_SUPPLEMENTS,
        "name": "Public Supplement Product",
        "category": "TestSuppCat",
    })
    pid = r.json()["id"]

    menu = await client.get("/public/menu")
    prod = next(
        (p for cat in menu.json() for p in cat["products"] if p["id"] == pid), None
    )
    assert prod is not None
    assert len(prod["supplements"]) == 1
    assert len(prod["supplements"][0]["options"]) == 2


# ═══════════════════════════════════════════════════════════════════════════════
# H. Edge cases
# ═══════════════════════════════════════════════════════════════════════════════

async def test_create_product_rejects_base64_image(client: AsyncClient, admin_token: str):
    """Backend must reject data: URI images — they must be uploaded first."""
    r = await client.post("/products/", headers=_AUTH(admin_token), json={
        **_BASE_PRODUCT,
        "name": "Base64 Reject Test",
        "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    })
    assert r.status_code == 422, "Backend must reject base64 data URIs"


async def test_images_endpoint_no_auth(client: AsyncClient):
    """GET /products/images requires no auth."""
    r = await client.get("/products/images")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_images_endpoint_returns_id_image_map(client: AsyncClient, admin_token: str):
    """Each entry must have 'id' and 'image' keys."""
    await client.post("/products/", headers=_AUTH(admin_token), json=_BASE_PRODUCT)
    r = await client.get("/products/images")
    assert r.status_code == 200
    for item in r.json():
        assert "id" in item
        assert "image" in item


async def test_list_products_excludes_image_field(client: AsyncClient, admin_token: str):
    """GET /products/ (list) returns empty string for image to reduce payload size."""
    create = await client.post("/products/", headers=_AUTH(admin_token), json={
        **_BASE_PRODUCT, "name": "Image Exclude Test", "image": "",
    })
    pid = create.json()["id"]
    listing = await client.get("/products/")
    product = next((p for p in listing.json() if p["id"] == pid), None)
    assert product is not None
    # image is explicitly set to "" in list response (include_image=False)
    assert product["image"] == ""


async def test_get_single_product_includes_image(client: AsyncClient, admin_token: str):
    """GET /products/{id} returns the actual image URL, not an empty string."""
    create = await client.post("/products/", headers=_AUTH(admin_token), json={
        **_BASE_PRODUCT,
        "name": "Image Include Test",
        "image": "https://example.com/img.jpg",
    })
    pid = create.json()["id"]
    r = await client.get(f"/products/{pid}")
    assert r.status_code == 200
    assert r.json()["image"] == "https://example.com/img.jpg"


async def test_product_create_response_includes_variations_and_supplements(client: AsyncClient, admin_token: str):
    """Create response must contain full variations + supplements structure."""
    payload = {
        **_PRODUCT_WITH_VARIATIONS,
        "name": "Full Structure Test",
        "supplements": _PRODUCT_WITH_SUPPLEMENTS["supplements"],
    }
    r = await client.post("/products/", headers=_AUTH(admin_token), json=payload)
    assert r.status_code == 201
    d = r.json()
    assert len(d["variations"]) == 1
    assert len(d["supplements"]) == 1
