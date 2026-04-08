from fastapi import APIRouter, Depends
import httpx

from app.dependencies import get_current_user
from app.models.settings import BrandingDocument, LocalizationDocument, IntegrationDocument
from app.schemas.settings import (
    BrandingUpdate, BrandingOut,
    LocalizationUpdate, LocalizationOut,
    IntegrationUpdate, IntegrationOut,
)

router = APIRouter()


async def _get_branding() -> BrandingDocument:
    doc = await BrandingDocument.find_one(BrandingDocument.key == "branding")
    if not doc:
        doc = BrandingDocument()
        await doc.insert()
    return doc


@router.get("/branding", response_model=BrandingOut)
async def get_branding():
    return await _get_branding()


@router.put("/branding", response_model=BrandingOut)
async def update_branding(data: BrandingUpdate):
    doc = await _get_branding()
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await doc.save()
    return doc


async def _get_localization() -> LocalizationDocument:
    doc = await LocalizationDocument.find_one(LocalizationDocument.key == "localization")
    if not doc:
        doc = LocalizationDocument()
        await doc.insert()
    return doc


@router.get("/localization", response_model=LocalizationOut)
async def get_localization():
    return await _get_localization()


@router.put("/localization", response_model=LocalizationOut)
async def update_localization(data: LocalizationUpdate):
    doc = await _get_localization()
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await doc.save()
    return doc


async def _get_integration() -> IntegrationDocument:
    doc = await IntegrationDocument.find_one(IntegrationDocument.key == "integration")
    if not doc:
        doc = IntegrationDocument()
        await doc.insert()
    return doc


@router.get("/integration", response_model=IntegrationOut)
async def get_integration():
    return await _get_integration()


@router.put("/integration", response_model=IntegrationOut)
async def update_integration(data: IntegrationUpdate):
    doc = await _get_integration()
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await doc.save()
    return doc


@router.post("/integration/test-bunny")
async def test_bunny_connection():
    doc = await _get_integration()

    if not doc.bunny_api_key:
        return {"ok": False, "message": "Storage Zone Password is empty — enter the FTP password from your Storage Zone."}
    if not doc.bunny_storage_zone:
        return {"ok": False, "message": "Storage Zone Name is empty — enter your FTP username (e.g. unagisushi)."}

    region = doc.bunny_storage_region or ""
    host = f"{region}.storage.bunnycdn.com" if region and region != "de" else "storage.bunnycdn.com"
    url = f"https://{host}/{doc.bunny_storage_zone}/"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers={"AccessKey": doc.bunny_api_key})
        if resp.status_code == 200:
            return {"ok": True, "message": f"Connected — {host}/{doc.bunny_storage_zone}"}
        elif resp.status_code == 401:
            return {"ok": False, "message": "Wrong password — use the Storage Zone Password (FTP password), not your account API key."}
        elif resp.status_code == 404:
            return {"ok": False, "message": f"Zone '{doc.bunny_storage_zone}' not found on {host} — check zone name matches your FTP username."}
        else:
            return {"ok": False, "message": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except httpx.ConnectError:
        return {"ok": False, "message": f"Cannot reach {host} — check your region setting."}
    except httpx.TimeoutException:
        return {"ok": False, "message": "Connection timed out."}

from fastapi import UploadFile, File, HTTPException
import uuid
import mimetypes

from pathlib import Path
import os
STATIC_DIR = Path(os.getenv("STATIC_DIR", Path(__file__).resolve().parent.parent.parent / "static"))

@router.post("/upload", dependencies=[Depends(get_current_user)])
async def upload_file(file: UploadFile = File(...)):
    doc = await _get_integration()

    ext = mimetypes.guess_extension(file.content_type) or ""
    if not ext and getattr(file, 'filename', None):
        if "." in file.filename:
            ext = "." + file.filename.split(".")[-1]

    filename = f"{uuid.uuid4().hex}{ext}"
    content = await file.read()

    # Upload to BunnyCDN if enabled and configured
    if getattr(doc, 'bunny_enabled', False) and doc.bunny_api_key and doc.bunny_storage_zone and doc.bunny_cdn_hostname:
        region = doc.bunny_storage_region or ""
        # BunnyCDN Storage Host: {region}.storage.bunnycdn.com
        # Default region (Falkenstein) is an empty string for the host prefix.
        host = f"{region}.storage.bunnycdn.com" if region and region.lower() != "de" else "storage.bunnycdn.com"
        
        # Ensure zone name and filename are properly joined
        storage_zone = doc.bunny_storage_zone.strip("/")
        url = f"https://{host}/{storage_zone}/{filename}"
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.put(
                    url,
                    headers={
                        "AccessKey": doc.bunny_api_key,
                        "Content-Type": file.content_type or "application/octet-stream",
                    },
                    content=content
                )
            if resp.status_code not in (200, 201):
                raise HTTPException(500, f"BunnyCDN Upload failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            raise HTTPException(500, f"BunnyCDN Upload error: {str(e)}")
            
        cdn_hostname = doc.bunny_cdn_hostname.strip("/")
        if not cdn_hostname.startswith("http"):
            cdn_hostname = f"https://{cdn_hostname}"
            
        return {"url": f"{cdn_hostname}/{filename}"}

    # Fallback: Local Upload
    upload_dir = STATIC_DIR / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / filename
    file_path.write_bytes(content)
    return {"url": f"/uploads/{filename}"}
