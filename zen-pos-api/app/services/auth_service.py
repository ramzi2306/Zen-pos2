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
    from app.models.register import RegisterSessionDocument
    
    user = await UserDocument.find_one(UserDocument.email == email)
    if not user or not verify_password(password, user.hashed_password):
        raise UnauthorizedError("Invalid email or password")

    tokens = await _issue_tokens(user)
    
    # Check for any open shift for this cashier
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    open_session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == str(user.id),
        RegisterSessionDocument.status == "OPEN"
    )
    
    # If session is from a previous day, close it automatically
    if open_session and open_session.opened_at < today_start:
        open_session.status = "CLOSED"
        open_session.closed_at = now
        await open_session.save()
        open_session = None

    if open_session:
        tokens.resumable = True
        tokens.register_session = {
            "id": str(open_session.id),
            "opened_at": open_session.opened_at.isoformat() if open_session.opened_at else None,
            "opening_float": open_session.opening_float,
            "net_cash_collected": open_session.net_cash_collected,
            "total_cash_withdrawn": open_session.total_cash_withdrawn,
        }
    else:
        tokens.resumable = False
        # Create a new session (for cashiers)
        # Find last closed session to pre-fill opening float
        last_session = await RegisterSessionDocument.find_one(
            RegisterSessionDocument.cashier_id == str(user.id),
            RegisterSessionDocument.status == "CLOSED",
            sort=[("closed_at", -1)]
        )
        opening_float = last_session.counted_closing_float if last_session and last_session.counted_closing_float is not None else 0
        
        new_session = RegisterSessionDocument(
            cashier_id=str(user.id),
            cashier_name=user.name,
            location_id=user.location_id,
            opening_float=opening_float
        )
        await new_session.insert()
        tokens.register_session = {
            "id": str(new_session.id),
            "opened_at": new_session.opened_at.isoformat(),
            "opening_float": new_session.opening_float,
            "net_cash_collected": new_session.net_cash_collected,
            "total_cash_withdrawn": new_session.total_cash_withdrawn,
        }

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
    from app.models.register import RegisterSessionDocument
    
    await user.fetch_all_links()
    role: RoleDocument = user.role  # may be None if user has no role assigned
    location_name = None
    if user.location_id:
        loc = await LocationDocument.get(user.location_id)
        location_name = loc.name if loc else None
        
    # Also fetch active register session
    open_session = await RegisterSessionDocument.find_one(
        RegisterSessionDocument.cashier_id == str(user.id),
        RegisterSessionDocument.status == "OPEN"
    )
    register_session = None
    if open_session:
        register_session = {
            "id": str(open_session.id),
            "opened_at": open_session.opened_at.isoformat() if open_session.opened_at else None,
            "opening_float": open_session.opening_float,
            "net_cash_collected": open_session.net_cash_collected,
            "total_cash_withdrawn": open_session.total_cash_withdrawn,
        }

    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "image": user.image,
        "role_id": str(role.id) if role else "",
        "role_name": role.name if role else "",
        "permissions": role.permissions if role else [],
        "base_salary": user.base_salary,
        "attendance_score": user.attendance_score,
        "attendance_group": user.attendance_group,
        "has_pin": user.hashed_pin is not None,
        "is_active": user.is_active,
        "location_id": user.location_id,
        "location_name": location_name,
        "exclude_from_attendance": role.exclude_from_attendance if role else False,
        "shifts": user.shifts,
        "payroll_due": user.payroll_due,
        "rewards": user.rewards,
        "sanctions": user.sanctions,
        "start_date": user.start_date,
        "contract_type": user.contract_type,
        "contract_date": user.contract_date,
        "contract_expiration": user.contract_expiration,
        "register_session": register_session,
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
