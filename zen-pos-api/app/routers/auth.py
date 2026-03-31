from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.models.user import UserDocument
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, AccessTokenResponse
from app.services import auth_service
from app.core.security import verify_password, hash_password

router = APIRouter()


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest):
    """Authenticate with email + password. Returns access and refresh tokens."""
    user, tokens = await auth_service.login(body.email, body.password)
    return tokens


@router.post("/refresh", response_model=AccessTokenResponse)
async def refresh(body: RefreshRequest):
    """Exchange a valid refresh token for a new access token (rotates refresh token)."""
    access_token = await auth_service.refresh_access_token(body.refresh_token)
    return AccessTokenResponse(access_token=access_token)


@router.post("/logout", status_code=204)
async def logout(body: RefreshRequest):
    """Revoke a refresh token."""
    await auth_service.logout(body.refresh_token)


@router.get("/me")
async def me(current_user: UserDocument = Depends(get_current_user)):
    """Return the authenticated user's profile and permissions."""
    return await auth_service.get_user_with_role(current_user)


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, current_user: UserDocument = Depends(get_current_user)):
    """Change the authenticated user's password."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    current_user.hashed_password = hash_password(body.new_password)
    await current_user.save()
    return {"message": "Password updated successfully"}

