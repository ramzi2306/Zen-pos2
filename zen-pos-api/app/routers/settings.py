from fastapi import APIRouter

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
