from pymongo import MongoClient
import json
from bson.json_util import dumps

client = MongoClient("mongodb://localhost:27017")
db = client["zenpos"]
users = list(db["users"].find({"is_active": True}))

for u in users:
    role_ref = u.get("role")
    role_id = role_ref.id if hasattr(role_ref, 'id') else None
    role_name = "Unknown"
    if role_id:
        role = db["roles"].find_one({"_id": role_id})
        role_name = role.get("name") if role else "Unknown"
    
    # Check if this user is a super admin or cashier
    print(f"User: {u.get('name')} | Role: {role_name}")
