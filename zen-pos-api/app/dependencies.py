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
        if permission not in (role.permissions if role else []):
            raise ForbiddenError(f"Permission '{permission}' required")
        return current_user

    return guard
