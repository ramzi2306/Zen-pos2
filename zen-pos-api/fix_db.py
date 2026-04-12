import asyncio
from app.database import connect_db
from app.models.settings import BrandingDocument

async def run():
    await connect_db()
    doc = await BrandingDocument.find_one(BrandingDocument.key == "branding")
    if doc:
        print("Found doc, updating...")
        doc.restaurant_name = "ZenPOS"
        doc.meta_title = "ZenPOS"
        await doc.save()
        print("Done")
    else:
        print("No doc found")

asyncio.run(run())
