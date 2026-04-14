from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017")
db = client["ZEN-POS"]
users = db["users"].find({"is_active": True})
for u in users:
    print(f"{u.get('name')} | role: {u.get('role')} | is_active: {u.get('is_active')}")
