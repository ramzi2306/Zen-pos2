from fastapi import APIRouter, Depends

from app.dependencies import get_current_user
from app.models.user import UserDocument
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest, AccessTokenResponse
from app.services import auth_service

router = APIRouter()


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
