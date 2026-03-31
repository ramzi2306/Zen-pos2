from typing import Optional
from pydantic import BaseModel


class LocationCreate(BaseModel):
    name: str
    subtitle: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    tables_count: int = 0
    bar_count: int = 0
    opening_time: str = ""
    closing_time: str = ""


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    subtitle: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tables_count: Optional[int] = None
    bar_count: Optional[int] = None
    opening_time: Optional[str] = None
    closing_time: Optional[str] = None


class LocationOut(BaseModel):
    id: str
    name: str
    subtitle: str
    address: str
    phone: str
    email: str
    tables_count: int
    bar_count: int
    opening_time: str
    closing_time: str
    is_active: bool
