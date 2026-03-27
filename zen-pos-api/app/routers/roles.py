from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import require_permission
from app.models.user import RoleDocument
from app.core.exceptions import NotFoundError, ConflictError

router = APIRouter()


class RoleCreate(BaseModel):
    name: str
    permissions: list[str] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[List[str]] = None


class RoleOut(BaseModel):
    id: str
    name: str
    permissions: list[str]


@router.get("/", response_model=list[RoleOut])
async def list_roles():
    roles = await RoleDocument.find_all().to_list()
    return [RoleOut(id=str(r.id), name=r.name, permissions=r.permissions) for r in roles]


@router.post("/", response_model=RoleOut, status_code=201,
             dependencies=[Depends(require_permission("manage_roles"))])
async def create_role(body: RoleCreate):
    if await RoleDocument.find_one(RoleDocument.name == body.name):
        raise ConflictError("Role name already exists")
    role = RoleDocument(name=body.name, permissions=body.permissions)
    await role.insert()
    return RoleOut(id=str(role.id), name=role.name, permissions=role.permissions)


@router.patch("/{role_id}", response_model=RoleOut,
              dependencies=[Depends(require_permission("manage_roles"))])
async def update_role(role_id: str, body: RoleUpdate):
    role = await RoleDocument.get(role_id)
    if not role:
        raise NotFoundError("Role not found")
    if body.name:
        role.name = body.name
    if body.permissions is not None:
        role.permissions = body.permissions
    await role.save()
    return RoleOut(id=str(role.id), name=role.name, permissions=role.permissions)


@router.delete("/{role_id}", status_code=204,
               dependencies=[Depends(require_permission("manage_roles"))])
async def delete_role(role_id: str):
    role = await RoleDocument.get(role_id)
    if not role:
        raise NotFoundError("Role not found")
    await role.delete()
