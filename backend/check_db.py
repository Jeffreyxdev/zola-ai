import asyncio
import aiosqlite

async def main():
    async with aiosqlite.connect("zola.db") as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT wallet, encrypted_privkey FROM users WHERE wallet='BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag'")
        row = await cur.fetchone()
        if row:
            print(dict(row))
        else:
            print("Row not found for wallet")

asyncio.run(main())
