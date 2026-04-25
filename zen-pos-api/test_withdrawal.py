import asyncio
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from app.models.register import RegisterSessionDocument, WithdrawalRecord
from app.services.register_service import record_cash_withdrawal
import os

async def test():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    await init_beanie(database=client["zenpos_db"], document_models=[RegisterSessionDocument])
    
    # Find an open session
    session = await RegisterSessionDocument.find_one(RegisterSessionDocument.status == "OPEN")
    if not session:
        print("No open session found")
        return
        
    print(f"Found session for {session.cashier_name}")
    try:
        await record_cash_withdrawal(session.cashier_id, 10.0, "Test withdrawal")
        print("Success")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
