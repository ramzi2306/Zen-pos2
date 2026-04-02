from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies import require_permission
from app.models.user import UserDocument, RoleDocument
from app.models.location import LocationDocument
from app.schemas.user import (
    UserCreate, UserUpdate, UserPublic, UserDetail,
    ChangeRoleRequest, AttendanceDayOut, WithdrawalLogOut, PersonalDocumentOut,
    UpdatePinRequest,
)
from app.core.exceptions import NotFoundError, ConflictError
from app.core.security import hash_password

router = APIRouter()


@router.get("/", response_model=list[UserPublic])
async def list_users(
    group: Optional[str] = Query(None, description="Filter by attendance_group"),
    location_id: Optional[str] = Query(None, description="Filter by location"),
):
    """List active users. Public for kiosk tablet use; pass ?group= or ?location_id= to filter."""
    query = UserDocument.find(UserDocument.is_active == True)  # noqa: E712
    if group:
        query = query.find(UserDocument.attendance_group == group)
    if location_id:
        query = query.find(UserDocument.location_id == location_id)
    users = await query.to_list()
    return [await _to_public(u) for u in users]


@router.get("/{user_id}", response_model=UserDetail,
            dependencies=[Depends(require_permission("view_staff"))])
async def get_user(user_id: str):
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    return await _to_detail(user)


@router.post("/", response_model=UserPublic, status_code=201,
             dependencies=[Depends(require_permission("view_staff"))])
async def create_user(body: UserCreate):
    existing = await UserDocument.find_one(UserDocument.email == body.email)
    if existing:
        raise ConflictError("Email already registered")

    role = await RoleDocument.get(body.role_id)
    if not role:
        raise NotFoundError("Role not found")

    # Validate location if provided
    location_name = None
    if body.location_id:
        loc = await LocationDocument.get(body.location_id)
        if not loc:
            from app.core.exceptions import NotFoundError
            raise NotFoundError("Location not found")
        location_name = loc.name

    user = UserDocument(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        hashed_pin=hash_password(body.pin) if body.pin else None,
        phone=body.phone,
        role=role,
        image=body.image or f"https://i.pravatar.cc/150?u={body.email}",
        base_salary=body.base_salary,
        contract_type=body.contract_type,
        start_date=body.start_date,
        location_id=body.location_id,
    )
    await user.insert()
    return await _to_public(user)


@router.patch("/{user_id}", response_model=UserDetail,
              dependencies=[Depends(require_permission("view_staff"))])
async def update_user(user_id: str, body: UserUpdate):
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await user.save()
    return await _to_detail(user)


@router.put("/{user_id}/role", response_model=UserPublic,
            dependencies=[Depends(require_permission("manage_roles"))])
async def change_role(user_id: str, body: ChangeRoleRequest):
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    role = await RoleDocument.get(body.role_id)
    if not role:
        raise NotFoundError("Role not found")
    user.role = role
    await user.save()
    return await _to_public(user)


@router.put("/{user_id}/pin", status_code=204,
            dependencies=[Depends(require_permission("view_staff"))])
async def set_pin(user_id: str, body: UpdatePinRequest):
    """Set or update a staff member's kiosk attendance PIN."""
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    user.hashed_pin = hash_password(body.pin)
    await user.save()


@router.delete("/{user_id}", status_code=204,
               dependencies=[Depends(require_permission("view_staff"))])
async def deactivate_user(user_id: str):
    user = await UserDocument.get(user_id)
    if not user:
        raise NotFoundError("User not found")
    user.is_active = False
    await user.save()


async def _to_public(user: UserDocument) -> UserPublic:
    await user.fetch_all_links()
    role: RoleDocument = user.role
    location_name: Optional[str] = None
    if user.location_id:
        loc = await LocationDocument.get(user.location_id)
        location_name = loc.name if loc else None
    return UserPublic(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        role_id=str(role.id) if role else "",
        role_name=role.name if role else "",
        permissions=role.permissions if role else [],
        image=user.image,
        base_salary=user.base_salary,
        attendance_score=user.attendance_score if user.monthly_attendance else 0,
        attendance_group=user.attendance_group,
        has_pin=user.hashed_pin is not None,
        is_active=user.is_active,
        location_id=user.location_id,
        location_name=location_name,
        shifts=user.shifts,
        start_date=user.start_date,
        contract_type=user.contract_type,
        contract_date=user.contract_date,
        contract_expiration=user.contract_expiration,
    )


async def _to_detail(user: UserDocument) -> UserDetail:
    await user.fetch_all_links()
    role: RoleDocument = user.role
    return UserDetail(
        id=str(user.id),
        name=user.name,
        email=user.email,
        phone=user.phone,
        role_id=str(role.id) if role else "",
        role_name=role.name if role else "",
        permissions=role.permissions if role else [],
        image=user.image,
        base_salary=user.base_salary,
        attendance_score=user.attendance_score if user.monthly_attendance else 0,
        attendance_group=user.attendance_group,
        has_pin=user.hashed_pin is not None,
        is_active=user.is_active,
        shifts=user.shifts,
        payroll_due=user.payroll_due,
        rewards=user.rewards,
        sanctions=user.sanctions,
        start_date=user.start_date,
        contract_type=user.contract_type,
        contract_date=user.contract_date,
        contract_expiration=user.contract_expiration,
        monthly_attendance=[
            AttendanceDayOut(
                day=a.day,
                hours=a.hours,
                is_late=a.is_late,
                is_early_departure=a.is_early_departure,
                is_overtime=a.is_overtime,
                check_in=a.check_in,
                check_out=a.check_out,
                reward_note=a.reward_note,
                sanction_note=a.sanction_note,
            )
            for a in (user.monthly_attendance or [])
        ],
        withdrawal_logs=[
            WithdrawalLogOut(id=w.id, amount=w.amount, date=w.date, status=w.status)
            for w in (user.withdrawal_logs or [])
        ],
        personal_documents=[
            PersonalDocumentOut(id=d.id, name=d.name, type=d.type, url=d.url)
            for d in (user.personal_documents or [])
        ],
    )
