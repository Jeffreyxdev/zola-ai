import asyncio
from solders.keypair import Keypair
import base58
import gemini_brain
from wallet_store import store_wallet
import os

async def debug_send():
    kr = Keypair()
    wallet_pubkey = str(kr.pubkey())
    
    # Correct method for solders Keypair is just bytes(kr) or kr.secret()
    privkey_b58 = base58.b58encode(bytes(kr)).decode()
    
    print("Generated Pubkey:", wallet_pubkey)
    
    receiver = "DDxkYdQLX8E1CgvoAZNY1iADB1qYzgAEsumHnoswHQcs"
    
    await store_wallet(wallet_pubkey, privkey_b58)
    print("Stored mock encrypted wallet.")

    print("--- Running send tool directly ---")
    res = await gemini_brain._tool_send_sol(wallet_pubkey, receiver, 0.1, "devnet")
    print("Result:", res)

if __name__ == "__main__":
    asyncio.run(debug_send())
