
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from app.models.daily_sales import DailySalesSummary

async def check_db(db_name):
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    try:
        await init_beanie(database=client[db_name], document_models=[DailySalesSummary])
        summaries = await DailySalesSummary.find(DailySalesSummary.total_revenue > 0).to_list()
        print(f"Summaries with revenue in {db_name}: {len(summaries)}")
    except Exception as e:
        print(f"Error checking {db_name}: {e}")

async def run():
    for db in ['digital_store', 'dmc_database', 'zen_pos', 'zenpos']:
        await check_db(db)

if __name__ == "__main__":
    asyncio.run(run())
