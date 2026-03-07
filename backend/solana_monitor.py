"""
Zola AI — Solana Wallet Monitor (Cluster-Aware)
- Supports mainnet-beta and devnet seamlessly
- Maintains a registry of connected WebSocket clients (wallet → WS queue)
- For each wallet opens a Solana logsSubscribe WS stream on the correct cluster
- On TX detected: pushes to frontend WS AND fires a Telegram alert
"""
import asyncio
import json
import logging
import os

import websockets
from dotenv import load_dotenv

from db import get_user

try:
    from telegram_bot import send_alert as tg_alert
except ImportError:
    async def tg_alert(chat_id, text):
        pass

load_dotenv()

log = logging.getLogger("zola.monitor")

# ── RPC URLs ─────────────────────────────────────────────────────────────────
_WS_URLS = {
    "mainnet-beta": os.getenv("SOLANA_RPC_WS",    "wss://api.mainnet-beta.solana.com"),
    "devnet":       os.getenv("SOLANA_RPC_WS_DEV", "wss://api.devnet.solana.com"),
}

def _ws_url(cluster: str) -> str:
    return _WS_URLS.get(cluster, _WS_URLS["mainnet-beta"])

def _rpc_url(cluster: str) -> str:
    if cluster == "devnet":
        return os.getenv("SOLANA_RPC_URL_DEV", "https://api.devnet.solana.com")
    return os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")

# ── Registry ─────────────────────────────────────────────────────────────────
# wallet → asyncio.Queue  (items here reach the frontend WS)
_queues: dict[str, asyncio.Queue] = {}
# wallet → monitor Task
_tasks: dict[str, asyncio.Task]   = {}
# wallet → cluster string (so we know which WS to subscribe to)
_clusters: dict[str, str]         = {}


def register(wallet: str, cluster: str = "mainnet-beta") -> asyncio.Queue:
    """Called when a frontend WebSocket connects. Returns the event queue."""
    _clusters[wallet] = cluster

    if wallet not in _queues:
        _queues[wallet] = asyncio.Queue(maxsize=100)

    # Restart monitor if cluster changed or not running
    old_task = _tasks.get(wallet)
    needs_restart = old_task is None or old_task.done()

    if not needs_restart and _clusters.get(wallet) != cluster:
        # Cluster switched — cancel old monitor and restart on new cluster
        old_task.cancel()
        needs_restart = True

    if needs_restart:
        _clusters[wallet] = cluster
        task = asyncio.create_task(_monitor_wallet(wallet, cluster))
        _tasks[wallet] = task
        log.info("Monitor started [%s] for %s…%s", cluster, wallet[:6], wallet[-4:])

    return _queues[wallet]


def unregister(wallet: str):
    """Called when the frontend WS disconnects."""
    if wallet in _tasks:
        _tasks[wallet].cancel()
        del _tasks[wallet]
    _queues.pop(wallet, None)
    _clusters.pop(wallet, None)
    log.info("Monitor stopped for %s…%s", wallet[:6], wallet[-4:])


def update_cluster(wallet: str, cluster: str):
    """
    Called when the user switches cluster in the dashboard.
    Restarts the monitor on the new cluster without disconnecting the WS.
    """
    if wallet not in _queues:
        return  # Not connected via WS yet
    if _clusters.get(wallet) == cluster:
        return  # No change

    log.info("Cluster switch → %s for wallet %s…", cluster, wallet[:6])

    # Cancel old monitor
    if wallet in _tasks:
        _tasks[wallet].cancel()

    _clusters[wallet] = cluster
    task = asyncio.create_task(_monitor_wallet(wallet, cluster))
    _tasks[wallet] = task

    # Push a notification to the frontend
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
    """Endlessly subscribe to Solana logs for `wallet` on the given cluster."""
    queue   = _queues.get(wallet)
    ws_url  = _ws_url(cluster)
    solscan = "https://solscan.io/tx/" + "{sig}"
    if cluster == "devnet":
        solscan = "https://solscan.io/tx/{sig}?cluster=devnet"

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

                    event = {
                        "type":      "tx",
                        "wallet":    wallet,
                        "cluster":   cluster,
                        "signature": signature,
                        "status":    status,
                        "error":     str(err) if err else None,
                        "explorer":  solscan.format(sig=signature),
                    }

                    log.info("[%s] TX %s… status=%s", cluster, signature[:10], status)

                    if queue:
                        try:
                            queue.put_nowait(event)
                        except asyncio.QueueFull:
                            pass

                    await _fire_tg_alert(wallet, signature, status, cluster)

        except asyncio.CancelledError:
            log.info("Monitor cancelled [%s] for %s", cluster, wallet[:6])
            return
        except Exception as e:
            log.warning(
                "Monitor WS error [%s] for %s: %s — reconnecting in 5s",
                cluster, wallet[:6], e
            )
            await asyncio.sleep(5)


async def _fire_tg_alert(wallet: str, signature: str, status: str, cluster: str):
    try:
        user = await get_user(wallet)
        if not user or not user.get("tg_chat_id"):
            return
        net        = "🧪 Devnet" if cluster == "devnet" else "🌐 Mainnet"
        short_sig  = f"{signature[:8]}…{signature[-8:]}"
        short_addr = f"{wallet[:6]}…{wallet[-6:]}"
        icon       = "✅" if status == "success" else "❌"
        url        = (
            f"https://solscan.io/tx/{signature}?cluster=devnet"
            if cluster == "devnet"
            else f"https://solscan.io/tx/{signature}"
        )
        msg = (
            f"{icon} *New Transaction Detected*\n"
            f"💳 Wallet: `{short_addr}`\n"
            f"🔗 Sig: `{short_sig}`\n"
            f"📊 Status: `{status}`\n"
            f"🌐 Network: {net}\n"
            f"[View on Solscan]({url})"
        )
        await tg_alert(user["tg_chat_id"], msg)
    except Exception as e:
        log.error("TG alert error: %s", e)
