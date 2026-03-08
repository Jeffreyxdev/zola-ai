import asyncio
from wallet_store import store_wallet
import os

async def main():
    wallet_pubkey = "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag"
    # Fallback env testing
    fallback = os.getenv("WALLET_PRIVKEY")
    if fallback:
        print("Mocking store wallet with fallback privkey")
        await store_wallet(wallet_pubkey, fallback)
        print("Stored successfully")
    else:
        print("No fallback WALLET_PRIVKEY found in env")

asyncio.run(main())
