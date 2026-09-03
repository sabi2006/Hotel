import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["hotel_billing"]
    cursor = db.products.find({})
    print("--- PRODUCTS IN MONGODB ---")
    async for p in cursor:
        print(f"ID: {p['_id']}, Name: {p.get('name')}, Image: {repr(p.get('image'))}")

if __name__ == "__main__":
    asyncio.run(check())
