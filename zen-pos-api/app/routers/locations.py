from fastapi import APIRouter, Depends

from app.dependencies import require_permission
from app.models.location import LocationDocument
from app.schemas.location import LocationCreate, LocationUpdate, LocationOut
from app.core.exceptions import NotFoundError

router = APIRouter()


@router.get("/", response_model=list[LocationOut])
async def list_locations():
    """List all active locations. No auth required — needed for onboarding dropdowns."""
    locations = await LocationDocument.find(LocationDocument.is_active == True).to_list()  # noqa: E712
    return [_to_out(loc) for loc in locations]


@router.get("/{location_id}", response_model=LocationOut)
async def get_location(location_id: str):
    loc = await LocationDocument.get(location_id)
    if not loc:
        raise NotFoundError("Location not found")
    return _to_out(loc)


@router.post("/", response_model=LocationOut, status_code=201,
             dependencies=[Depends(require_permission("view_settings"))])
async def create_location(body: LocationCreate):
    loc = LocationDocument(**body.model_dump())
    await loc.insert()
    return _to_out(loc)


@router.put("/{location_id}", response_model=LocationOut,
            dependencies=[Depends(require_permission("view_settings"))])
async def update_location(location_id: str, body: LocationUpdate):
    loc = await LocationDocument.get(location_id)
    if not loc:
        raise NotFoundError("Location not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(loc, key, value)
    await loc.save()
    return _to_out(loc)


@router.delete("/{location_id}", status_code=204,
               dependencies=[Depends(require_permission("view_settings"))])
async def delete_location(location_id: str):
    loc = await LocationDocument.get(location_id)
    if not loc:
        raise NotFoundError("Location not found")
    loc.is_active = False
    await loc.save()


def _to_out(loc: LocationDocument) -> LocationOut:
    return LocationOut(
        id=str(loc.id),
        name=loc.name,
        subtitle=loc.subtitle,
        address=loc.address,
        phone=loc.phone,
        email=loc.email,
        tables_count=loc.tables_count,
        bar_count=loc.bar_count,
        is_active=loc.is_active,
    )
