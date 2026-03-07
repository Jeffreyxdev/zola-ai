"""
Zola AI — FastAPI Backend
Endpoints:
  POST  /api/link-wallet       — register/update wallet (with cluster)
  PUT   /api/cluster           — live cluster switch (mainnet-beta|devnet)
  POST  /api/link-telegram     — generate one-time TG link code
  POST  /api/link-twitter      — store Twitter handle for gating
  GET   /api/status/{wallet}   — linked accounts status
  GET   /api/activity/{wallet} — recent Solana transactions (cluster-aware)
  POST  /api/bot/command       — execute a bot command (cluster-aware)
  WS    /ws/{wallet}           — real-time TX push channel
"""
import asyncio
import json
import logging
import os
import secrets
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
import solana_monitor
import telegram_bot
import twitter_bot

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("zola.main")

SOLANA_RPC    = os.getenv("SOLANA_RPC_URL",         "https://api.mainnet-beta.solana.com")
TG_BOT_NAME   = os.getenv("TELEGRAM_BOT_USERNAME",  "Zolaactive_bot")

# --------------------------------------------------------------------------- #
# Lifespan — start / stop background services
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 Zola AI backend starting…")
    await db.init_db()

    # Start Telegram bot as background task
    tg_task = asyncio.create_task(telegram_bot.start())
    # Start Twitter bot as background task
    tw_task = asyncio.create_task(twitter_bot.start())

    log.info("✅ Zola AI backend ready")
    yield  # ←── server is live here

    # Shutdown
    twitter_bot.stop()
    await telegram_bot.stop()
    tg_task.cancel()
    tw_task.cancel()
    log.info("Backend shut down cleanly.")


app = FastAPI(title="Zola AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten this to your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Request / Response models
# --------------------------------------------------------------------------- #
class LinkWalletRequest(BaseModel):
    wallet:  str
    cluster: str = "mainnet-beta"  # or "devnet"

class ClusterUpdateRequest(BaseModel):
    wallet:  str
    cluster: str  # "mainnet-beta" or "devnet"

class LinkTelegramRequest(BaseModel):
    wallet: str

class LinkTwitterRequest(BaseModel):
    wallet: str
    twitter_handle: str

class BotCommandRequest(BaseModel):
    wallet:  str
    command: str
    cluster: str = "mainnet-beta"


# --------------------------------------------------------------------------- #
# REST endpoints
# --------------------------------------------------------------------------- #
@app.get("/")
async def root():
    return {"service": "Zola AI", "status": "running"}


@app.post("/api/link-wallet")
async def link_wallet(body: LinkWalletRequest):
    """Called by frontend after wallet connect. Creates/touches the user row."""
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    cluster = body.cluster if body.cluster in ("mainnet-beta", "devnet") else "mainnet-beta"
    await db.upsert_user(body.wallet, cluster=cluster)
    # Tell the monitor about this wallet + cluster (no-op if not yet WS-connected)
    solana_monitor.update_cluster(body.wallet, cluster)
    log.info("Wallet linked [%s]: %s…%s", cluster, body.wallet[:6], body.wallet[-4:])
    return {"status": "ok", "wallet": body.wallet, "cluster": cluster}


@app.put("/api/cluster")
async def set_cluster(body: ClusterUpdateRequest):
    """
    Called when the user toggles the cluster switch in the dashboard.
    Updates DB + live monitor without dropping the WebSocket connection.
    """
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    cluster = body.cluster if body.cluster in ("mainnet-beta", "devnet") else "mainnet-beta"
    await db.upsert_user(body.wallet, cluster=cluster)
    solana_monitor.update_cluster(body.wallet, cluster)
    log.info("Cluster switch [%s] for wallet %s…", cluster, body.wallet[:6])
    return {"status": "ok", "cluster": cluster}


@app.post("/api/link-telegram")
async def link_telegram(body: LinkTelegramRequest):
    """
    Generate a one-time code and return a Telegram deep-link.
    The frontend opens t.me/<bot>?start=<code> — user just clicks Start.
    The bot reads the start param and calls /link automatically.
    Response: { code, deep_link, bot_username }
    """
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    code = secrets.token_hex(3).upper()  # e.g. "A3F9C2"
    await db.upsert_user(body.wallet, tg_link_code=code)
    deep_link = f"https://t.me/{TG_BOT_NAME}?start={code}"
    log.info("TG link code [%s] for wallet %s… deep=%s", code, body.wallet[:6], deep_link)
    return {
        "status":       "ok",
        "code":         code,
        "bot_username": TG_BOT_NAME,
        "deep_link":    deep_link,
    }


@app.post("/api/link-twitter")
async def link_twitter(body: LinkTwitterRequest):
    """Store a Twitter handle for a wallet (needed for Twitter bot gating)."""
    if not body.wallet or not body.twitter_handle:
        raise HTTPException(400, "wallet and twitter_handle are required")
    handle = body.twitter_handle.lstrip("@")
    await db.upsert_user(body.wallet, twitter_handle=handle)
    log.info("Twitter linked: @%s → wallet %s…", handle, body.wallet[:6])
    return {"status": "ok", "twitter_handle": handle}


@app.get("/api/status/{wallet}")
async def status(wallet: str):
    """Return linked accounts state for a wallet."""
    user = await db.get_user(wallet)
    if not user:
        return {"wallet": wallet, "telegram": False, "twitter": False, "registered": False, "cluster": "mainnet-beta"}
    return {
        "wallet":     wallet,
        "registered": True,
        "telegram":   bool(user.get("tg_chat_id")),
        "twitter":    bool(user.get("twitter_handle")),
        "twitter_handle": user.get("twitter_handle"),
        "cluster":    user.get("cluster", "mainnet-beta"),
    }


@app.get("/api/status-by-code")
async def status_by_code(code: str):
    """
    Polled by the frontend TelegramModal to detect when linking completes.
    Returns {linked: true} once the bot has processed the deep-link start code.
    """
    user = await db.find_by_link_code(code)
    # Code still in DB with no tg_chat_id → not yet linked
    if user and not user.get("tg_chat_id"):
        return {"linked": False}
    # Code consumed (cleared) or tg_chat_id set → linked!
    return {"linked": True}


@app.get("/api/activity/{wallet}")
async def activity(wallet: str, limit: int = 8, cluster: str = "mainnet-beta"):
    """Proxy recent Solana transactions for a wallet."""
    rpc = (
        "https://api.devnet.solana.com"
        if cluster == "devnet"
        else SOLANA_RPC
    )
    payload = {
        "jsonrpc": "2.0", "id": 1,
        "method": "getSignaturesForAddress",
        "params": [wallet, {"limit": limit}],
    }
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post(rpc, json=payload)
            data = r.json()
        sigs = data.get("result", [])
        return {"wallet": wallet, "transactions": sigs}
    except Exception as e:
        raise HTTPException(502, f"RPC error: {e}")


@app.post("/api/bot/command")
async def bot_command(body: BotCommandRequest):
    """
    Execute a bot command from the in-app BotTerminal.
    Returns a text response to display in the terminal.
    """
    cmd = body.command.strip().lower()
    wallet = body.wallet

    if cmd == "/help":
        return {
            "response": (
                "Available commands:\n"
                "  /balance  — live SOL balance\n"
                "  /history  — recent transactions\n"
                "  /status   — linked accounts\n"
                "  /alerts   — notification settings\n"
                "  /pay @handle <amount> — send SOL via X"
            )
        }

    if cmd == "/balance":
        user = await db.get_user(wallet)
        cluster = body.cluster or (user.get("cluster", "mainnet-beta") if user else "mainnet-beta")
        rpc_url = (
            "https://api.devnet.solana.com"
            if cluster == "devnet"
            else os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
        )
        try:
            payload = {
                "jsonrpc": "2.0", "id": 1,
                "method": "getBalance",
                "params": [wallet],
            }
            async with httpx.AsyncClient(timeout=8) as cli:
                r = await cli.post(rpc_url, json=payload)
            lamps = r.json()["result"]["value"]
            sol = lamps / 1_000_000_000
            net = "🧪 Devnet" if cluster == "devnet" else "🌐 Mainnet"
            return {"response": f"💰 Balance: {sol:.6f} SOL  ({net})"}
        except Exception as e:
            return {"response": f"⚠️ Could not fetch balance: {e}"}

    if cmd == "/history":
        user = await db.get_user(wallet)
        cluster = body.cluster or (user.get("cluster", "mainnet-beta") if user else "mainnet-beta")
        rpc_url = (
            "https://api.devnet.solana.com"
            if cluster == "devnet"
            else os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com")
        )
        try:
            payload = {
                "jsonrpc": "2.0", "id": 1,
                "method": "getSignaturesForAddress",
                "params": [wallet, {"limit": 5}],
            }
            async with httpx.AsyncClient(timeout=10) as cli:
                r = await cli.post(rpc_url, json=payload)
            sigs = r.json().get("result", [])
            if not sigs:
                return {"response": f"No recent transactions on {cluster}."}
            net = "devnet" if cluster == "devnet" else ""
            lines = [f"Recent transactions ({cluster}):"]
            for s in sigs:
                sig = s["signature"]
                ts  = s.get("blockTime", 0)
                err = "❌" if s.get("err") else "✅"
                lines.append(f"  {err} {sig[:12]}… | {ts}")
            return {"response": "\n".join(lines)}
        except Exception as e:
            return {"response": f"⚠️ Could not fetch history: {e}"}

    if cmd == "/status":
        user = await db.get_user(wallet)
        tg = "✅ Connected" if user and user.get("tg_chat_id") else "❌ Not linked"
        tw = "✅ Connected" if user and user.get("twitter_handle") else "❌ Not linked"
        tw_handle = f"@{user['twitter_handle']}" if user and user.get("twitter_handle") else "—"
        short = f"{wallet[:6]}…{wallet[-6:]}"
        return {
            "response": (
                f"✅ Telegram: {tg}\n"
                f"✅ X (Twitter): {tw} ({tw_handle})\n"
                f"🟣 Wallet: {short}"
            )
        }

    if cmd == "/alerts":
        return {
            "response": (
                "Notification settings:\n"
                "  ✅ Incoming payments\n"
                "  ✅ Bot executions\n"
                "  ✅ Vote alerts\n"
                "  Toggle in the Notifications tab."
            )
        }

    # Unknown command
    return {"response": f'Unknown command: "{body.command}". Type /help for commands.'}


# --------------------------------------------------------------------------- #
# WebSocket: real-time TX push
# --------------------------------------------------------------------------- #
@app.websocket("/ws/{wallet}")
async def websocket_endpoint(ws: WebSocket, wallet: str, cluster: str = "mainnet-beta"):
    await ws.accept()
    log.info("[WS] New connection [%s]: %s…%s", cluster, wallet[:6], wallet[-4:])

    # Look up stored cluster preference (set when wallet was linked)
    user = await db.get_user(wallet)
    stored_cluster = (user.get("cluster", "mainnet-beta") if user else cluster)
    active_cluster = stored_cluster  # may be overridden by query param

    # Register wallet with the monitor → get its event queue
    queue = solana_monitor.register(wallet, active_cluster)

    # Send immediate welcome
    await ws.send_json({
        "type": "connected",
        "wallet": wallet,
        "message": f"👋 Zola AI monitoring {wallet[:6]}…{wallet[-6:]}",
    })

    try:
        while True:
            # Pull next event from monitor queue (timeout allows detecting WS close)
            try:
                event = await asyncio.wait_for(queue.get(), timeout=20)
                await ws.send_json(event)
            except asyncio.TimeoutError:
                # Send a heartbeat ping
                await ws.send_json({"type": "ping"})

    except WebSocketDisconnect:
        log.info("[WS] Disconnected: %s…%s", wallet[:6], wallet[-4:])
    except Exception as e:
        log.error("[WS] Error for %s: %s", wallet[:6], e)
    finally:
        solana_monitor.unregister(wallet)
