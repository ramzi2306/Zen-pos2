import asyncio
from app.database import connect_db
from app.models.settings import BrandingDocument

async def run():
    await connect_db()
    
    doc = await BrandingDocument.find_one(BrandingDocument.key == "branding")
    print("Found doc:", doc)

asyncio.run(run())
