"""
Zola AI — Solana Wallet Monitor (Persistent + Cluster-Aware)
KEY CHANGE: Monitors now live independently of frontend WebSocket connections.
- Wallets are registered on /api/link-wallet and monitored until explicitly removed.
- Frontend WS subscribes to a wallet's event queue but disconnecting does NOT stop the monitor.
- This ensures Telegram alerts fire for ALL transactions, even when the browser is closed.
"""
import asyncio
import json
import logging
import os

import websockets
from dotenv import load_dotenv

from db import get_user, get_all_monitored_wallets

try:
    from telegram_bot import send_alert as tg_alert
except ImportError:
    async def tg_alert(chat_id, text):
        pass

load_dotenv()

log = logging.getLogger("zola.monitor")

# ── RPC URLs ─────────────────────────────────────────────────────────────────
def _ws_url(cluster: str = "mainnet-beta") -> str:
    if cluster == "devnet":
        return os.getenv("WS_URL_DEV", "wss://api.devnet.solana.com")
    return os.getenv("WS_URL", "wss://api.mainnet-beta.solana.com")


def _rpc_url(cluster: str = "mainnet-beta") -> str:
    if cluster == "devnet":
        return os.getenv("RPC_URL_DEV", "https://api.devnet.solana.com")
    return os.getenv("RPC_URL", "https://api.mainnet-beta.solana.com")


# ── Registry ─────────────────────────────────────────────────────────────────
# wallet → asyncio.Queue  (frontend WS consumers read from this)
_queues:   dict[str, asyncio.Queue] = {}
# wallet → monitor Task   (persists independently of WS clients)
_tasks:    dict[str, asyncio.Task]  = {}
# wallet → cluster string
_clusters: dict[str, str]           = {}
# wallet → set of frontend WS connected (count; 0 means no browser, monitor still runs)
_ws_count: dict[str, int]           = {}
# wallet → last known balance (SOL)
_balances: dict[str, float]         = {}


# ── Startup: resume monitoring all known wallets ──────────────────────────────

async def resume_all():
    """
    Called at backend startup. Loads all wallets from DB that have a tg_chat_id
    and starts persistent monitors for them so TG alerts never stop.
    """
    try:
        wallets = await get_all_monitored_wallets()
        for row in wallets:
            wallet  = row["wallet"]
            cluster = row.get("cluster", "mainnet-beta")
            _ensure_monitor(wallet, cluster)
        log.info("Monitor: resumed %d persistent wallet(s)", len(wallets))
    except Exception as e:
        log.warning("Monitor resume error: %s", e)


def _ensure_monitor(wallet: str, cluster: str):
    """Start a monitor task if not already running."""
    if wallet not in _queues:
        _queues[wallet] = asyncio.Queue(maxsize=200)
    _clusters[wallet] = cluster

    old = _tasks.get(wallet)
    if old is None or old.done():
        task = asyncio.create_task(_monitor_wallet(wallet, cluster))
        _tasks[wallet] = task
        log.info("Monitor started [%s] for %s…%s", cluster, wallet[:6], wallet[-4:])


# ── Public API ────────────────────────────────────────────────────────────────

def register(wallet: str, cluster: str = "mainnet-beta") -> asyncio.Queue:
    """
    Called when a frontend WebSocket connects.
    Ensures the monitor is running and returns the event queue.
    """
    _ws_count[wallet] = _ws_count.get(wallet, 0) + 1

    if wallet not in _queues:
        _queues[wallet] = asyncio.Queue(maxsize=200)

    # Restart if cluster changed
    stored = _clusters.get(wallet)
    if stored != cluster:
        old = _tasks.get(wallet)
        if old and not old.done():
            old.cancel()
        _clusters[wallet] = cluster

    _ensure_monitor(wallet, cluster)
    return _queues[wallet]


def unregister(wallet: str):
    """
    Called when the frontend WS disconnects.
    Decrements the WS counter but KEEPS the monitor running for TG alerts.
    """
    count = _ws_count.get(wallet, 0)
    _ws_count[wallet] = max(0, count - 1)
    log.info(
        "Frontend WS disconnected for %s…%s (monitor still active, ws_count=%d)",
        wallet[:6], wallet[-4:], _ws_count[wallet],
    )
    # Do NOT cancel the task — monitor stays alive for TG alerts


def stop_wallet(wallet: str):
    """Explicitly stop monitoring a wallet (e.g. user unlinks account)."""
    if wallet in _tasks:
        _tasks[wallet].cancel()
        del _tasks[wallet]
    _queues.pop(wallet, None)
    _clusters.pop(wallet, None)
    _ws_count.pop(wallet, None)
    log.info("Monitor fully stopped for %s…%s", wallet[:6], wallet[-4:])


def update_cluster(wallet: str, cluster: str):
    """
    Called when the user switches cluster in the dashboard.
    Restarts the monitor on the new cluster without dropping anything.
    """
    if _clusters.get(wallet) == cluster:
        return  # No change

    log.info("Cluster switch → %s for wallet %s…", cluster, wallet[:6])
    old = _tasks.get(wallet)
    if old and not old.done():
        old.cancel()

    _clusters[wallet] = cluster
    if wallet not in _queues:
        _queues[wallet] = asyncio.Queue(maxsize=200)

    task = asyncio.create_task(_monitor_wallet(wallet, cluster))
    _tasks[wallet] = task

    try:
        _queues[wallet].put_nowait({
            "type":    "cluster_changed",
            "cluster": cluster,
            "message": f"🔄 Switched to {cluster}",
        })
    except asyncio.QueueFull:
        pass


# ── Core monitor loop ─────────────────────────────────────────────────────────
async def _monitor_wallet(wallet: str, cluster: str):
    """
    Persistently subscribe to Solana logs for `wallet` on the given cluster.
    Fires TG alerts regardless of whether there's a frontend WS connected.
    """
    queue  = _queues.get(wallet)
    ws_url = _ws_url(cluster)
    solscan_tmpl = (
        "https://solscan.io/tx/{sig}?cluster=devnet"
        if cluster == "devnet"
        else "https://solscan.io/tx/{sig}"
    )

    while True:
        try:
            async with websockets.connect(
                ws_url,
                ping_interval=30,
                ping_timeout=10,
                close_timeout=5,
            ) as ws:
                subscribe = {
                    "jsonrpc": "2.0",
                    "id":      1,
                    "method":  "logsSubscribe",
                    "params":  [
                        {"mentions": [wallet]},
                        {"commitment": "finalized"},
                    ],
                }
                await ws.send(json.dumps(subscribe))
                log.info("Subscribed [%s] for %s…%s", cluster, wallet[:6], wallet[-4:])

                async for raw in ws:
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    if "params" not in data:
                        continue

                    result    = data["params"]["result"]["value"]
                    signature = result.get("signature", "unknown")
                    err       = result.get("err")
                    status    = "failed" if err else "success"
                    logs      = result.get("logs", [])

                    # Determine transfer direction from logs
                    direction = _detect_direction(wallet, logs)

                    event = {
                        "type":      "tx",
                        "wallet":    wallet,
                        "cluster":   cluster,
                        "signature": signature,
                        "status":    status,
                        "direction": direction,
                        "error":     str(err) if err else None,
                        "explorer":  solscan_tmpl.format(sig=signature),
                    }

                    log.info("[%s] TX %s… status=%s dir=%s", cluster, signature[:10], status, direction)

                    # Push to frontend queue (only if there's a consumer)
                    if queue and _ws_count.get(wallet, 0) > 0:
                        try:
                            queue.put_nowait(event)
                        except asyncio.QueueFull:
                            pass

                    # Always fire TG alert (regardless of frontend connection)
                    await _fire_tg_alert(wallet, signature, status, cluster, direction)

        except asyncio.CancelledError:
            log.info("Monitor cancelled [%s] for %s", cluster, wallet[:6])
            return
        except Exception as e:
            log.warning(
                "Monitor WS error [%s] for %s: %s — reconnecting in 5s",
                cluster, wallet[:6], e,
            )
            await asyncio.sleep(5)


def _detect_direction(wallet: str, logs: list) -> str:
    """
    Crude heuristic: if logs mention the wallet as sender → outbound.
    Falls back to 'unknown'. This can be improved with parsed instruction data.
    """
    w_lower = wallet.lower()
    for line in logs:
        l = line.lower()
        if "transfer" in l and w_lower in l:
            return "outbound"
    return "inbound"


async def _fire_tg_alert(wallet: str, signature: str, status: str, cluster: str, direction: str = "unknown"):
    try:
        user = await get_user(wallet)
        if not user or not user.get("tg_chat_id"):
            return

        net        = "🧪 Devnet" if cluster == "devnet" else "🌐 Mainnet"
        short_sig  = f"{signature[:8]}…{signature[-8:]}"
        short_addr = f"{wallet[:6]}…{wallet[-6:]}"
        status_icon = "✅" if status == "success" else "❌"
        dir_icon   = "📤" if direction == "outbound" else "📥"
        url        = (
            f"https://solscan.io/tx/{signature}?cluster=devnet"
            if cluster == "devnet"
            else f"https://solscan.io/tx/{signature}"
        )

        msg = (
            f"{status_icon} {dir_icon} *Transaction Detected*\n"
            f"💳 Wallet: `{short_addr}`\n"
            f"🔗 Sig: `{short_sig}`\n"
            f"📊 Status: `{status}`\n"
            f"🧭 Direction: {direction.capitalize()}\n"
            f"🌐 Network: {net}\n"
            f"[View on Solscan]({url})"
        )
        await tg_alert(user["tg_chat_id"], msg)
    except Exception as e:
        log.error("TG alert error: %s", e)

# ── Polling Monitor (Delta detection) ─────────────────────────────────────────
async def _poll_balances_loop():
    """Polls known wallets every 30s to detect balance deltas >= 0.001 SOL."""
    log.info("Balance Delta Monitor started ✅")
    import gemini_brain
    while True:
        try:
            await asyncio.sleep(30)
            for wallet, cluster in list(_clusters.items()):
                # Only check if monitoring task is active
                if wallet not in _tasks or _tasks[wallet].done():
                    continue

                res = await gemini_brain._tool_get_balance(wallet, cluster)
                if "balance_sol" in res:
                    new_bal = res["balance_sol"]
                    old_bal = _balances.get(wallet)

                    if old_bal is not None:
                        delta = new_bal - old_bal
                        if abs(delta) >= 0.001:
                            direction = "📥 Received" if delta > 0 else "📤 Sent"
                            msg = (
                                f"🚨 *Balance Change Detected*\n"
                                f"💳 Wallet: `{wallet[:6]}…{wallet[-6:]}`\n"
                                f"{direction}: *{abs(delta):.4f} SOL*\n"
                                f"💰 New Balance: *{new_bal:.4f} SOL*"
                            )
                            user = await get_user(wallet)
                            if user and user.get("tg_chat_id"):
                                await tg_alert(user["tg_chat_id"], msg)
                    
                    _balances[wallet] = new_bal
        except Exception as e:
            log.error("Delta poll error: %s", e)

def run_monitor_tick() -> asyncio.Task:
    """Returns the monitoring loop task to attach to lifespan."""
    return asyncio.create_task(_poll_balances_loop())
