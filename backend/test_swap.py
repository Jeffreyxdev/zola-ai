import asyncio
import gemini_brain
import os
from dotenv import load_dotenv

load_dotenv()

async def main():
    wallet_pubkey = "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag"
    
    print("Testing swap command:")
    res = await gemini_brain.interpret_command(
        f"swap 0.1 sol for usdc on devnet",
        wallet_pubkey,
        {"cluster": "devnet"}
    )
    print("RESPONSE:", res)

if __name__ == "__main__":
    asyncio.run(main())
