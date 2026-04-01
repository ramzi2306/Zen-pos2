from typing import List, Optional
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.exceptions import UnauthorizedError, ForbiddenError
from app.core.security import decode_token, JWTError
from app.models.user import UserDocument

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> UserDocument:
    if not credentials:
        raise UnauthorizedError()
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise UnauthorizedError("Invalid token type")
        user_id: str = payload["sub"]
    except (JWTError, KeyError):
        raise UnauthorizedError("Invalid or expired token")

    user = await UserDocument.get(user_id)
    if not user:
        raise UnauthorizedError("User not found")
    return user


def require_permission(permission: str):
    """FastAPI dependency factory — protects a route by permission name."""

    async def guard(current_user: UserDocument = Depends(get_current_user)):
        await current_user.fetch_all_links()
        role = current_user.role
        
        perms = [p.lower() for p in (role.permissions if role else [])]
        req_perm = permission.lower()
        if req_perm in perms:
            return current_user
            
        role_name = (role.name if role else "").lower()
        email = (current_user.email or "").lower()
        
        is_cashier = "cashier" in role_name or "caissier" in role_name or "caissière" in role_name
        is_chef = "chef" in role_name or "cook" in role_name or "cuisinier" in role_name or "kitchen" in role_name
        is_manager = "manager" in role_name or "gérant" in role_name or "responsable" in role_name
        is_admin = "admin" in role_name or "owner" in role_name or "prop" in role_name

        if is_admin:
            return current_user
        if is_manager and req_perm in ["view_menu", "view_orders", "view_staff", "view_inventory", "view_attendance", "view_hr"]:
            return current_user
        if is_cashier and req_perm in ["view_menu", "view_orders"]:
            return current_user
        if is_chef and req_perm in ["view_menu", "view_orders"]:
            return current_user
        if req_perm == "view_attendance" and ("attendance" in role_name or "pointeur" in role_name or "pointeur" in email):
            return current_user
        if req_perm == "view_hr" and ("hr" in role_name or is_manager):
            return current_user
        if req_perm == "view_staff" and ("staff" in role_name or is_manager):
            return current_user
        if req_perm == "view_settings" and is_admin:
            return current_user

        raise ForbiddenError(f"Permission '{permission}' required")

    return guard
