import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        resp = await client.get("http://localhost:8000/users/")
        print("Status", resp.status_code)
        print("Body", resp.text[:500])

asyncio.run(main())
