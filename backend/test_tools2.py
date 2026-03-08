import asyncio
import os
from dotenv import load_dotenv
import gemini_brain

load_dotenv()

async def debug_send():
    wallet_pubkey = "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag"
    receiver = "DDxkYdQLX8E1CgvoAZNY1iADB1qYzgAEsumHnoswHQcs"
    
    print("--- Running send tool directly ---")
    res = await gemini_brain._tool_send_sol(wallet_pubkey, receiver, 0.1, "devnet")
    print("Result:", res)

if __name__ == "__main__":
    asyncio.run(debug_send())
