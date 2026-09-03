import asyncio
from pymongo import AsyncMongoClient

async def test_mongo(uri, name):
    print(f"\n--- Testing {name} ({uri}) ---")
    try:
        client = AsyncMongoClient(uri, serverSelectionTimeoutMS=4000)
        await client.admin.command("ping")
        print(f"SUCCESS: Connected to {name}!")
        await client.close()
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        return False

async def main():
    atlas_uri = "mongodb+srv://sabiahamed7_db_user:0NjHQbYzTyhUt0CO@cluster0.z9vmrax.mongodb.net/?appName=Cluster0"
    local_uri = "mongodb://localhost:27017"
    
    local_ok = await test_mongo(local_uri, "Local MongoDB")
    atlas_ok = await test_mongo(atlas_uri, "MongoDB Atlas")
    
    print("\n=== SUMMARY ===")
    if local_ok:
        print("RECOMMENDATION: Use local MongoDB (set MONGODB_URI=mongodb://localhost:27017 in .env)")
    elif atlas_ok:
        print("RECOMMENDATION: Atlas is working now! Run uvicorn.")
    else:
        print("Both failed. Either add 0.0.0.0/0 to Atlas Network Access or start local MongoDB service.")

if __name__ == "__main__":
    asyncio.run(main())
