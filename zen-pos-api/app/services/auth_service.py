from datetime import datetime, timedelta, timezone

from app.core.exceptions import UnauthorizedError, NotFoundError
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    JWTError,
)
from app.models.token import RefreshTokenDocument
from app.models.user import UserDocument, RoleDocument
from app.schemas.auth import TokenResponse
from app.config import settings


async def login(email: str, password: str) -> tuple[UserDocument, TokenResponse]:
    user = await UserDocument.find_one(UserDocument.email == email)
    if not user or not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")

    tokens = await _issue_tokens(user)
    return user, tokens


async def refresh_access_token(refresh_token: str) -> str:
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type")
        user_id = payload["sub"]
    except (JWTError, KeyError):
        raise UnauthorizedError("Invalid or expired refresh token")

    stored = await RefreshTokenDocument.find_one(
        RefreshTokenDocument.token == refresh_token,
        RefreshTokenDocument.revoked == False,  # noqa: E712
    )
    if not stored:
        raise UnauthorizedError("Refresh token revoked or not found")

    # Rotate: revoke old, issue new
    stored.revoked = True
    await stored.save()

    user = await UserDocument.get(user_id)
    if not user:
        raise UnauthorizedError("User not found")

    new_refresh = create_refresh_token(user_id)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)
    await RefreshTokenDocument(user=user, token=new_refresh, expires_at=expires).insert()

    return create_access_token(user_id)


async def logout(refresh_token: str) -> None:
    stored = await RefreshTokenDocument.find_one(
        RefreshTokenDocument.token == refresh_token
    )
    if stored:
        stored.revoked = True
        await stored.save()


async def get_user_with_role(user: UserDocument) -> dict:
    from app.models.location import LocationDocument
    await user.fetch_all_links()
    role: RoleDocument = user.role
    location_name = None
    if user.location_id:
        loc = await LocationDocument.get(user.location_id)
        location_name = loc.name if loc else None
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "image": user.image,
        "role_id": str(role.id),
        "role_name": role.name,
        "permissions": role.permissions,
        "base_salary": user.base_salary,
        "attendance_score": user.attendance_score,
        "attendance_group": user.attendance_group,
        "has_pin": user.hashed_pin is not None,
        "is_active": user.is_active,
        "location_id": user.location_id,
        "location_name": location_name,
        "shifts": user.shifts,
        "payroll_due": user.payroll_due,
        "rewards": user.rewards,
        "sanctions": user.sanctions,
        "start_date": user.start_date,
        "contract_type": user.contract_type,
        "contract_date": user.contract_date,
        "contract_expiration": user.contract_expiration,
        "monthly_attendance": [
            {
                "day": a.day,
                "hours": a.hours,
                "is_late": a.is_late,
                "is_early_departure": a.is_early_departure,
                "is_overtime": a.is_overtime,
                "check_in": a.check_in,
                "check_out": a.check_out,
                "reward_note": a.reward_note,
                "sanction_note": a.sanction_note,
            }
            for a in user.monthly_attendance
        ],
        "withdrawal_logs": [
            {"id": w.id, "amount": w.amount, "date": w.date, "status": w.status}
            for w in user.withdrawal_logs
        ],
        "personal_documents": [
            {"id": d.id, "name": d.name, "type": d.type, "url": d.url}
            for d in user.personal_documents
        ],
    }


# ── Internal helpers ───────────────────────────────────────

async def _issue_tokens(user: UserDocument) -> TokenResponse:
    user_id = str(user.id)
    access = create_access_token(user_id)
    refresh = create_refresh_token(user_id)

    expires = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expire_days)
    await RefreshTokenDocument(user=user, token=refresh, expires_at=expires).insert()

    return TokenResponse(access_token=access, refresh_token=refresh)
