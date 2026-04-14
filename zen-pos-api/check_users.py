from pymongo import MongoClient
import json
from bson.json_util import dumps

client = MongoClient("mongodb://localhost:27017")
db = client["zenpos"]
users = list(db["users"].find({"is_active": True}))
roles = {str(r["_id"]): r for r in db["roles"].find()}

result = []
for u in users:
    role_id = u.get("role", {}).get("$id")
    role = roles.get(str(role_id), {}) if role_id else {}
    result.append({
        "name": u.get("name"),
        "role": role.get("name"),
        "exclude": role.get("exclude_from_attendance")
    })

print(dumps(result, indent=2))
