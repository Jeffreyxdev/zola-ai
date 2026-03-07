import asyncio
import json
import websockets
import os
import requests
from dotenv import load_dotenv # Run: pip install python-dotenv

# Load Synq Studio Environment
load_dotenv()
WALLET = os.getenv("WALLET")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")
WS_URL = os.getenv("WS_URL")

def send_telegram(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": message, "parse_mode": "Markdown"}
    try:
        requests.post(url, json=payload, timeout=5)
    except Exception as e:
        print(f"❌ Telegram Error: {e}")

async def monitor():
    async for ws in websockets.connect(WS_URL):
        try:
            subscribe_msg = {
                "jsonrpc": "2.0", "id": 1, "method": "logsSubscribe",
                "params": [{"mentions": [WALLET]}, {"commitment": "finalized"}]
            }
            await ws.send(json.dumps(subscribe_msg))
            print(f"🚀 ZOLA-AI CLOUD READY | Monitoring: {WALLET[:6]}...")

            while True:
                response = await ws.recv()
                data = json.loads(response)
                
                if "params" in data:
                    signature = data["params"]["result"]["value"].get("signature")
                    
                    # Log to console
                    print(f"🎯 Catch: {signature[:12]}...")
                    
                    # Execution (Sender extracted from local test wallet)
                    os.system(f"solana transfer {WALLET} 0.5 --url localhost --allow-unfunded-recipient")
                    
                    # Notify
                    send_telegram(f"✅ *Autonomous Success*\n🔗 *ID:* `{signature[:8]}...`\n📊 *Sent:* 0.5 SOL")

        except websockets.ConnectionClosed:
            print("📡 Connection lost. Reconnecting in 5s...")
            await asyncio.sleep(5)
            continue

if __name__ == "__main__":
    asyncio.run(monitor())