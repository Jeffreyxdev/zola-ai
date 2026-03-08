import asyncio
from db import get_user, init_db
from solana_monitor import _fire_tg_alert

async def main():
    await init_db()
    
    # We test user GY4L138jXDRZBBJ4SKgkTMm4tdwhZHM92HosY1nRrR7y
    wallet = "GY4L138jXDRZBBJ4SKgkTMm4tdwhZHM92HosY1nRrR7y"
    user = await get_user(wallet)
    print("User for GY4L...:", user)
    
    # Check what happens if we fire a TG alert manually
    print("Firing TG alert...")
    await _fire_tg_alert(wallet, "test_sig", "success", "devnet", "outbound")
    print("Fired alert")

asyncio.run(main())
