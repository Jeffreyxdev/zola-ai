import asyncio
import json
from solana.rpc.websocket_api import connect

# Your verified wallet address
WALLET_ADDRESS = "BomSHWqSMH7Ptaccb8NnApQPCNoDrBN6q7RQxwsjPGag"

async def monitor_wallet():
    # Connect to your LOCAL validator's websocket
    url = "ws://127.0.0.1:8900"
    
    async with connect(url) as websocket:
        # Use the raw 'mentions' filter. This avoids the broken SDK class imports.
        await websocket.logs_subscribe(
            filter_={"mentions": [WALLET_ADDRESS]}
        )
        print(f"📡 Zola-AI is now listening for {WALLET_ADDRESS}...")

        # Process notifications in real-time
        async for message in websocket:
            print("-" * 40)
            print("🚀 NEW TRANSACTION DETECTED!")
            # Convert result to clean JSON string
            print(json.dumps(message, indent=2, default=str))
            print("-" * 40)

if __name__ == "__main__":
    try:
        asyncio.run(monitor_wallet())
    except KeyboardInterrupt:
        print("Stopping listener...")