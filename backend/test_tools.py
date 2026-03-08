import asyncio
import os
import sys

from dotenv import load_dotenv

import gemini_brain

load_dotenv()

async def debug_send():
    wallet_pubkey = "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag"
    receiver = "DDxkYdQLX8E1CgvoAZNY1iADB1qYzgAEsumHnoswHQcs"

    try:
        from wallet_store import get_user_wallet
        privkey = await get_user_wallet(wallet_pubkey)
        print("Privkey length:", len(privkey) if privkey else "None")
        
        # Test tool get_keypair directly
        sender_kr = await gemini_brain._get_keypair(wallet_pubkey)
        print("Keypair instantiated:", bool(sender_kr))
    except Exception as e:
        print("Error getting wallet:", e)

    print("--- Running send tool ---")
    res = await gemini_brain._tool_send_sol(wallet_pubkey, receiver, 0.1, "devnet")
    print("Result:", res)

if __name__ == "__main__":
    asyncio.run(debug_send())
