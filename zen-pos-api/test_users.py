import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.user import UserDocument, RoleDocument
from app.routers.users import _to_public
import sys

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client.zenpos, document_models=[UserDocument, RoleDocument])
    users = await UserDocument.find_all().to_list()
    for u in users:
        try:
            res = await _to_public(u)
        except Exception as e:
            print(f"Error for user {u.email}: {e}")
            sys.exit(1)
    print("All success!")
if __name__ == "__main__":
    asyncio.run(main())
