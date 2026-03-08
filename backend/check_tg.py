import asyncio
from db import get_user
async def main():
    user = await get_user("BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag")
    print("User:", user)
asyncio.run(main())
