import asyncio
from db import get_user, init_db
from solana_monitor import _fire_tg_alert

async def main():
    await init_db()
    
    # We test user GY4L138jXDRZBBJ4SKgkTMm4tdwhZHM92HosY1nRrR7y
    wallet = "GY4L138jXDRZBBJ4SKgkTMm4tdwhZHM92HosY1nRrR7y"
    user = await get_user(wallet)
    print("User for GY4L...:", user)

    # configure a short throttle for testing and ensure inbound is ignored
    import os
    os.environ["TG_ALERT_THROTTLE"] = "0.1"      # only one per 100ms
    os.environ["TG_ALERT_INCLUDE_INBOUND"] = "0"

    print("Firing first outbound alert (should send)...")
    await _fire_tg_alert(wallet, "test_sig", "success", "devnet", "outbound")
    print("Fired outbound")

    print("Firing inbound success alert (should be suppressed)...")
    await _fire_tg_alert(wallet, "test_sig", "success", "devnet", "inbound")
    print("Done inbound")

    print("Firing second outbound alert immediately (should be throttled)...")
    await _fire_tg_alert(wallet, "test_sig2", "success", "devnet", "outbound")
    print("Done second outbound")

asyncio.run(main())
