"""
Zola AI — FastAPI Backend
Endpoints:
  POST  /api/link-wallet           — register/update wallet (with cluster)
  PUT   /api/cluster               — live cluster switch (mainnet-beta|devnet)
  POST  /api/link-telegram         — generate one-time TG link code
  POST  /api/link-twitter          — store Twitter handle for gating
  GET   /api/status/{wallet}       — linked accounts status
  GET   /api/activity/{wallet}     — recent Solana transactions (cluster-aware)
  POST  /api/bot/command           — execute a bot command (cluster-aware)
  WS    /ws/{wallet}               — real-time TX push channel

  POST  /api/subscribe             — initiate pro subscription
  POST  /api/subscribe/confirm     — confirm payment tx on-chain
  GET   /api/subscription/{wallet} — get subscription status
  POST  /api/subscription/cancel   — cancel auto-renewal

  GET   /api/pro/analytics/{wallet} — pro wallet analytics
  GET   /api/pro/portfolio/{wallet} — pro portfolio with USD values
  GET   /api/pro/sniper/{wallet}    — pro sniper opportunities

  GET   /admin/stats               — admin overview stats
  GET   /admin/users               — paginated user list
  GET   /admin/users/{wallet}      — full user profile
  POST  /admin/users/{wallet}/upgrade
  POST  /admin/users/{wallet}/downgrade
  GET   /admin/revenue             — revenue breakdown
  GET   /admin/swaps               — recent swaps
  POST  /admin/team                — add team member (superadmin)
  DELETE /admin/team/{wallet}      — remove team member (superadmin)
"""
import asyncio
import json
import logging
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from dotenv import load_dotenv

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sentry_sdk
import db
import solana_monitor
import telegram_bot
import twitter_bot
import dca_engine
import gemini_brain

load_dotenv()
try:
    import sentry_sdk
    sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"))
except ImportError:
    pass # Sentry is optional
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("zola.main")

SOLANA_RPC         = os.getenv("RPC_URL",             "https://api.mainnet-beta.solana.com")
TG_BOT_NAME        = os.getenv("TELEGRAM_BOT_USERNAME", "Zolaactive_bot")
TREASURY_WALLET    = os.getenv("ZOLA_TREASURY_WALLET", "")
USDC_MINT          = os.getenv("USDC_MINT",            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
PRO_PRICE_USD      = float(os.getenv("PRO_PRICE_USD",  "6.0"))

# In-memory cache for pro analytics (5-min TTL)
_analytics_cache: dict[str, tuple[dict, datetime]] = {}

# --------------------------------------------------------------------------- #
# Background task helpers
# --------------------------------------------------------------------------- #
async def _get_sol_price_usd() -> float:
    try:
        async with httpx.AsyncClient(timeout=5) as cli:
            r = await cli.get("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
            return float(r.json().get("solana", {}).get("usd", 150.0))
    except Exception:
        return 150.0


async def _notify_telegram(wallet: str, message: str):
    """Send Telegram message to user linked to this wallet."""
    try:
        user = await db.get_user(wallet)
        if user and user.get("tg_chat_id"):
            await telegram_bot.send_alert(user["tg_chat_id"], message)
    except Exception as e:
        log.warning("TG notify failed for %s: %s", wallet[:8], e)


# --------------------------------------------------------------------------- #
# Lifespan — start / stop background services
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 Zola AI backend starting…")
    await db.init_db()

    # Resume persistent monitors
    await solana_monitor.resume_all()

    # Start background tasks
    tg_task = asyncio.create_task(telegram_bot.start())
    tw_task = asyncio.create_task(twitter_bot.start())
    dca_task = dca_engine.start()
    monitor_poll_task = solana_monitor.run_monitor_tick()

    # ── Hourly autonomous Gemini scan ───────────────────────────────────────
    async def _scan_loop():
        while True:
            await asyncio.sleep(3600)
            try:
                wallets = await db.get_all_monitored_wallets()
                if not wallets:
                    continue
                alerts = await gemini_brain.autonomous_scan([w["wallet"] for w in wallets])
                for alert in alerts:
                    msg = alert["message"]
                    for w in wallets:
                        user = await db.get_user(w["wallet"])
                        if user and user.get("tg_chat_id"):
                            await telegram_bot.send_alert(user["tg_chat_id"], msg)
            except Exception as e:
                log.error("Scan loop error: %s", e)

    # ── Daily subscription renewal loop ─────────────────────────────────────
    async def _subscription_renewal_loop():
        while True:
            await asyncio.sleep(86400)  # every 24h
            try:
                now = datetime.now(timezone.utc)
                expiring = await db.get_expiring_subscriptions()
                for sub in expiring:
                    wallet = sub["wallet"]
                    token  = sub["payment_token"]
                    try:
                        keypair = gemini_brain._get_keypair(wallet)
                        if not keypair:
                            await _notify_telegram(
                                wallet,
                                "⚠️ *Zola Pro renewal due!*\nYour subscription expires soon. "
                                "Please renew manually at https://use-zola.vercel.app/dashboard"
                            )
                            continue

                        sol_price = await _get_sol_price_usd()
                        if token == "SOL":
                            amount = PRO_PRICE_USD / sol_price
                        else:
                            amount = PRO_PRICE_USD  # USDC

                        result = await _charge_subscription(wallet, token, keypair, amount, sol_price)
                        if result["status"] == "success":
                            expires = (now + timedelta(days=30)).isoformat()
                            await db.upsert_subscription(
                                wallet,
                                plan="pro",
                                expires_at=expires,
                                last_charged=now.isoformat(),
                                tx_signature=result["signature"],
                            )
                            await db.log_payment(
                                wallet,
                                amount if token == "SOL" else None,
                                amount if token == "USDC" else None,
                                token,
                                result["signature"],
                                "success",
                            )
                            await _notify_telegram(wallet, "✅ *Zola Pro renewed!* Active for another 30 days.")
                        else:
                            await db.upsert_subscription(wallet, plan="free", auto_renew=0)
                            await _notify_telegram(wallet, "❌ *Zola Pro renewal failed.* Downgraded to free tier.")
                    except Exception as sub_err:
                        log.error("Renewal error for %s: %s", wallet[:8], sub_err)
            except Exception as e:
                log.error("Renewal loop error: %s", e)

    # ── Pro alerts loop (every 5 min) ────────────────────────────────────────
    async def _pro_alerts_loop():
        while True:
            await asyncio.sleep(300)
            try:
                alerts_configs = await db.get_all_pro_alerts()
                if not alerts_configs:
                    continue

                sol_price = await _get_sol_price_usd()

                for cfg in alerts_configs:
                    wallet = cfg["wallet"]
                    try:
                        # Price target alerts
                        if cfg.get("price_targets"):
                            targets = json.loads(cfg["price_targets"])
                            for t in targets:
                                token   = t.get("token", "SOL")
                                target  = float(t.get("target", 0))
                                direction = t.get("direction", "above")
                                price   = sol_price if token.upper() == "SOL" else 0

                                hit = (direction == "above" and price >= target) or \
                                      (direction == "below" and price <= target)
                                if hit:
                                    await _notify_telegram(
                                        wallet,
                                        f"🎯 *Price Alert!* {token} is ${price:.2f} "
                                        f"({'above' if direction == 'above' else 'below'} your target of ${target})"
                                    )

                        # AI hourly insight (gated to pro)
                        if cfg.get("ai_insights"):
                            insight = await gemini_brain.autonomous_scan([wallet])
                            for alert in insight:
                                await _notify_telegram(wallet, f"🤖 *Pro Insight*\n{alert['message']}")

                    except Exception as cfg_err:
                        log.warning("Pro alert error for %s: %s", wallet[:8], cfg_err)
            except Exception as e:
                log.error("Pro alerts loop error: %s", e)

    scan_task     = asyncio.create_task(_scan_loop())
    renewal_task  = asyncio.create_task(_subscription_renewal_loop())
    alerts_task   = asyncio.create_task(_pro_alerts_loop())

    log.info("✅ Zola AI backend ready")
    yield  # ←── server is live here

    # Shutdown
    twitter_bot.stop()
    await telegram_bot.stop()
    dca_engine.stop()
    for task in [tg_task, tw_task, dca_task, scan_task, renewal_task, alerts_task]:
        task.cancel()
    monitor_poll_task.cancel()
    log.info("Backend shut down cleanly.")


app = FastAPI(title="Zola AI", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Request / Response models
# --------------------------------------------------------------------------- #
class LinkWalletRequest(BaseModel):
    wallet:  str
    cluster: str = "mainnet-beta"

class ClusterUpdateRequest(BaseModel):
    wallet:  str
    cluster: str

class LinkTelegramRequest(BaseModel):
    wallet: str

class LinkTwitterRequest(BaseModel):
    wallet: str
    twitter_handle: str

class BotCommandRequest(BaseModel):
    wallet:  str
    command: str
    cluster: str = "mainnet-beta"

class SubscribeRequest(BaseModel):
    wallet: str
    token:  str = "SOL"  # 'SOL' | 'USDC'

class SubscribeConfirmRequest(BaseModel):
    wallet:       str
    tx_signature: str

class CancelSubscriptionRequest(BaseModel):
    wallet: str

class AdminUpgradeRequest(BaseModel):
    plan: str = "pro"
    days: int = 30

class AddTeamRequest(BaseModel):
    wallet: str
    role:   str = "viewer"
    name:   Optional[str] = None

class SaveProAlertsRequest(BaseModel):
    wallet:          str
    price_targets:   Optional[str] = None  # JSON array string
    whale_threshold: float = 10000.0
    custom_triggers: Optional[str] = None
    ai_insights:     int = 1


# --------------------------------------------------------------------------- #
# Auth dependencies
# --------------------------------------------------------------------------- #
ROLE_HIERARCHY = {"viewer": 0, "admin": 1, "superadmin": 2}

async def require_pro(wallet: str):
    sub = await db.get_subscription(wallet)
    if not sub or sub.get("plan") != "pro":
        raise HTTPException(403, "Zola Pro required")
    if sub.get("expires_at"):
        try:
            exp = datetime.fromisoformat(sub["expires_at"])
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < datetime.now(timezone.utc):
                raise HTTPException(403, "Subscription expired — please renew at /dashboard")
        except HTTPException:
            raise
        except Exception:
            pass
    return sub


async def require_admin(wallet: str, min_role: str = "viewer"):
    # Check env bootstrap list first
    admin_env = os.getenv("ADMIN_WALLETS", "")
    if wallet in [w.strip() for w in admin_env.split(",") if w.strip()]:
        return {"wallet": wallet, "role": "superadmin"}
    admin = await db.get_admin_user(wallet)
    if not admin:
        raise HTTPException(403, "Not authorized — admin access required")
    if ROLE_HIERARCHY.get(admin["role"], -1) < ROLE_HIERARCHY.get(min_role, 0):
        raise HTTPException(403, f"Requires '{min_role}' role or higher")
    return admin


async def require_superadmin(wallet: str):
    return await require_admin.__wrapped__(wallet, "superadmin") if hasattr(require_admin, "__wrapped__") else await require_admin(wallet, "superadmin")


# Convenience: require_admin with specific role
def admin_dep(min_role: str = "viewer"):
    async def _dep(wallet: str):
        return await require_admin(wallet, min_role)
    return _dep


# --------------------------------------------------------------------------- #
# Internal helpers
# --------------------------------------------------------------------------- #
async def _charge_subscription(wallet: str, token: str, keypair, amount: float, sol_price: float) -> dict:
    """Build and send SOL or USDC payment to treasury wallet."""
    if not TREASURY_WALLET:
        return {"status": "error", "error": "Treasury wallet not configured"}
    try:
        from solders.pubkey import Pubkey
        from solana.rpc.async_api import AsyncClient
        from solders.system_program import TransferParams, transfer
        from solders.message import MessageV0
        from solders.transaction import VersionedTransaction

        client = AsyncClient(SOLANA_RPC)
        receiver = Pubkey.from_string(TREASURY_WALLET)

        if token == "SOL":
            lamports = int(amount * 1_000_000_000)
            ix  = transfer(TransferParams(from_pubkey=keypair.pubkey(), to_pubkey=receiver, lamports=lamports))
            bh  = (await client.get_latest_blockhash()).value.blockhash
            msg = MessageV0.try_compile(keypair.pubkey(), [ix], [], bh)
            tx  = VersionedTransaction(msg, [keypair])
        else:
            # USDC SPL transfer (simplified — requires associated token accounts to exist)
            return {"status": "error", "error": "USDC auto-renewal not yet supported. Please renew manually."}

        resp = await client.send_transaction(tx)
        return {"status": "success", "signature": str(resp.value)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


async def _verify_tx_on_chain(signature: str, expected_to: str, expected_min_lamports: int) -> bool:
    """Verify a transaction on-chain by polling until confirmed."""
    try:
        payload = {
            "jsonrpc": "2.0", "id": 1,
            "method": "getTransaction",
            "params": [signature, {"encoding": "jsonParsed", "commitment": "confirmed"}],
        }
        async with httpx.AsyncClient(timeout=15) as cli:
            for _ in range(15):
                r = await cli.post(SOLANA_RPC, json=payload)
                result = r.json().get("result")
                if result:
                    # Check transaction is not errored
                    if result.get("meta", {}).get("err"):
                        return False
                    return True  # Basic success check
                await asyncio.sleep(2)
            return False # Timed out
    except Exception as e:
        log.error("TX verify error: %s", e)
        return False


# --------------------------------------------------------------------------- #
# REST endpoints — existing
# --------------------------------------------------------------------------- #
@app.get("/")
async def root():
    return {"service": "Zola AI", "status": "running", "version": "2.0.0"}


@app.post("/api/link-wallet")
async def link_wallet(body: LinkWalletRequest):
    """Called by frontend after wallet connect. Creates/touches the user row."""
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    cluster = body.cluster if body.cluster in ("mainnet-beta", "devnet") else "mainnet-beta"
    await db.upsert_user(body.wallet, cluster=cluster)
    solana_monitor.update_cluster(body.wallet, cluster)
    log.info("Wallet linked [%s]: %s…%s", cluster, body.wallet[:6], body.wallet[-4:])
    return {"status": "ok", "wallet": body.wallet, "cluster": cluster}


@app.put("/api/cluster")
async def set_cluster(body: ClusterUpdateRequest):
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    cluster = body.cluster if body.cluster in ("mainnet-beta", "devnet") else "mainnet-beta"
    await db.upsert_user(body.wallet, cluster=cluster)
    solana_monitor.update_cluster(body.wallet, cluster)
    log.info("Cluster switch [%s] for wallet %s…", cluster, body.wallet[:6])
    return {"status": "ok", "cluster": cluster}


@app.post("/api/link-telegram")
async def link_telegram(body: LinkTelegramRequest):
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    code = secrets.token_hex(3).upper()
    await db.upsert_user(body.wallet, tg_link_code=code)
    deep_link = f"https://t.me/{TG_BOT_NAME}?start={code}"
    log.info("TG link code [%s] for wallet %s… deep=%s", code, body.wallet[:6], deep_link)
    return {"status": "ok", "code": code, "bot_username": TG_BOT_NAME, "deep_link": deep_link}


@app.post("/api/link-twitter")
async def link_twitter(body: LinkTwitterRequest):
    if not body.wallet or not body.twitter_handle:
        raise HTTPException(400, "wallet and twitter_handle are required")
    handle = body.twitter_handle.lstrip("@")
    await db.upsert_user(body.wallet, twitter_handle=handle)
    log.info("Twitter linked: @%s → wallet %s…", handle, body.wallet[:6])
    return {"status": "ok", "twitter_handle": handle}


@app.get("/api/status/{wallet}")
async def status(wallet: str):
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
    user = await db.find_by_link_code(code)
    if user and not user.get("tg_chat_id"):
        return {"linked": False}
    return {"linked": True}

@app.get("/api/wallet/{wallet}/transactions")
async def wallet_transactions(wallet: str, limit: int = 10, cluster: str = "mainnet-beta"):
    """Fetch parsed transactions for the TxHistory panel."""
    rpc = "https://api.devnet.solana.com" if cluster == "devnet" else SOLANA_RPC
    try:
        async with httpx.AsyncClient(timeout=15) as cli:
            # 1. Get signatures
            r = await cli.post(rpc, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getSignaturesForAddress",
                "params": [wallet, {"limit": limit}],
            })
            sigs_data = r.json().get("result") or []
            
            # 2. Get parsed transactions concurrently
            async def fetch_tx(s):
                sig = s.get("signature")
                if not sig: return None
                
                try:
                    r2 = await cli.post(rpc, json={
                        "jsonrpc": "2.0", "id": 1,
                        "method": "getTransaction",
                        "params": [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}],
                    })
                    tx_data = r2.json().get("result")
                except Exception as ex:
                    log.warning(f"Fetch tx {sig} failed: {ex}")
                    return None

                amount = "—"
                tx_type = "Transaction"
                
                if tx_data:
                    try:
                        meta = tx_data.get("meta", {})
                        tx_info = tx_data.get("transaction", {})
                        message = tx_info.get("message", {})
                        account_keys = message.get("accountKeys", [])
                        
                        my_idx = -1
                        for i, k in enumerate(account_keys):
                            pubkey = k.get("pubkey") if isinstance(k, dict) else k
                            if pubkey == wallet:
                                my_idx = i
                                break
                                
                        if my_idx >= 0 and meta:
                            pre = meta.get("preBalances", [])[my_idx] if my_idx < len(meta.get("preBalances", [])) else 0
                            post = meta.get("postBalances", [])[my_idx] if my_idx < len(meta.get("postBalances", [])) else 0
                            net = (post - pre) / 1e9
                            
                            amount_str = f"{net:.4f}"
                            amount = ("+" if net >= 0 else "") + amount_str + " SOL"
                            tx_type = "Sent" if net < 0 else "Received" if net > 0 else "Transaction"
                    except Exception as parse_e:
                        log.warning(f"Failed to parse tx {sig}: {parse_e}")
                
                return {
                    "sig": sig,
                    "blockTime": s.get("blockTime"),
                    "err": s.get("err"),
                    "type": tx_type,
                    "amount": amount
                }

            if not sigs_data:
                return {"status": "ok", "transactions": []}

            results = await asyncio.gather(*(fetch_tx(s) for s in sigs_data), return_exceptions=True)
            txs = [res for res in results if isinstance(res, dict) and res is not None]
                
            return {"status": "ok", "transactions": txs}
    except Exception as e:
        log.error("Failed to fetch transactions for %s: %s", wallet, type(e).__name__)
        raise HTTPException(500, f"RPC error: {type(e).__name__}")


@app.get("/api/wallet/{wallet}/activity")
async def wallet_activity(wallet: str, limit: int = 10, cluster: str = "mainnet-beta"):
    """Proxy getSignaturesForAddress to avoid frontend public RPC 403s."""
    rpc = "https://api.devnet.solana.com" if cluster == "devnet" else SOLANA_RPC
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post(rpc, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getSignaturesForAddress",
                "params": [wallet, {"limit": limit}],
            })
            return {"status": "ok", "signatures": r.json().get("result", [])}
    except Exception as e:
        log.error("Failed to fetch activity for %s: %s", wallet, e)
        raise HTTPException(500, f"RPC error: {e}")


@app.get("/api/activity/{wallet}")
async def activity(wallet: str, limit: int = 8, cluster: str = "mainnet-beta"):
    rpc = "https://api.devnet.solana.com" if cluster == "devnet" else SOLANA_RPC
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
    wallet = body.wallet
    response_text = await gemini_brain.interpret_command(body.command, wallet, {"cluster": body.cluster})
    return {"response": response_text}


# --------------------------------------------------------------------------- #
# Subscription endpoints
# --------------------------------------------------------------------------- #
@app.post("/api/subscribe")
async def subscribe(body: SubscribeRequest):
    """Initiate a Pro subscription — returns amount to send and treasury address."""
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    if body.token not in ("SOL", "USDC"):
        raise HTTPException(400, "token must be 'SOL' or 'USDC'")
    if not TREASURY_WALLET:
        raise HTTPException(503, "Subscription payments not configured on this server")

    sol_price = await _get_sol_price_usd()
    if body.token == "SOL":
        amount = round(PRO_PRICE_USD / sol_price, 6)
    else:
        amount = PRO_PRICE_USD  # 6.0 USDC

    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    # Fetch blockhash from backend to avoid frontend rate-limits (403s on public nodes)
    blockhash = ""
    try:
        from solana.rpc.async_api import AsyncClient
        client = AsyncClient(SOLANA_RPC)
        resp = await client.get_latest_blockhash()
        blockhash = resp.value.blockhash
    except Exception as e:
        log.error("Failed to fetch blockhash for subscribe: %s", e)

    return {
        "amount":     amount,
        "recipient":  TREASURY_WALLET,
        "token":      body.token,
        "usdc_mint":  USDC_MINT,
        "expires_at": expires_at,
        "price_usd":  PRO_PRICE_USD,
        "sol_price":  sol_price,
        "blockhash":  blockhash,
    }


@app.post("/api/subscribe/confirm")
async def subscribe_confirm(body: SubscribeConfirmRequest):
    """Confirm payment tx on-chain and activate Pro for the wallet."""
    if not body.wallet or not body.tx_signature:
        raise HTTPException(400, "wallet and tx_signature are required")

    # Basic on-chain verification
    verified = await _verify_tx_on_chain(body.tx_signature, TREASURY_WALLET, 0)
    if not verified:
        await db.log_payment(body.wallet, None, None, "unknown", body.tx_signature, "failed")
        raise HTTPException(400, "Transaction not confirmed on-chain. Please try again.")

    now        = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=30)).isoformat()

    await db.upsert_subscription(
        body.wallet,
        plan="pro",
        started_at=now.isoformat(),
        expires_at=expires_at,
        last_charged=now.isoformat(),
        tx_signature=body.tx_signature,
        auto_renew=1,
    )

    # Log payment (we don't have amount here since the tx was sent by frontend)
    await db.log_payment(body.wallet, None, None, "unknown", body.tx_signature, "success")

    log.info("Pro activated for wallet %s… (tx: %s…)", body.wallet[:8], body.tx_signature[:12])
    return {"status": "success", "plan": "pro", "expires_at": expires_at}


@app.get("/api/subscription/{wallet}")
async def get_subscription(wallet: str):
    sub = await db.get_subscription(wallet)
    if not sub:
        return {"wallet": wallet, "plan": "free", "expires_at": None, "auto_renew": 0, "payment_token": "SOL"}
    return {
        "wallet":        wallet,
        "plan":          sub.get("plan", "free"),
        "expires_at":    sub.get("expires_at"),
        "auto_renew":    sub.get("auto_renew", 0),
        "payment_token": sub.get("payment_token", "SOL"),
        "started_at":    sub.get("started_at"),
    }


@app.post("/api/subscription/cancel")
async def cancel_subscription(body: CancelSubscriptionRequest):
    if not body.wallet:
        raise HTTPException(400, "wallet is required")
    await db.upsert_subscription(body.wallet, auto_renew=0)
    return {"status": "ok", "message": "Auto-renewal disabled. Your Pro access continues until the current period ends."}


# --------------------------------------------------------------------------- #
# Pro feature endpoints (require_pro guard)
# --------------------------------------------------------------------------- #
@app.get("/api/pro/analytics/{wallet}")
async def pro_analytics(wallet: str, sub=Depends(require_pro)):
    # Check cache (5-min TTL)
    cached = _analytics_cache.get(wallet)
    if cached and (datetime.now(timezone.utc) - cached[1]).seconds < 300:
        return cached[0]

    rpc = SOLANA_RPC
    try:
        # Fetch recent signatures
        async with httpx.AsyncClient(timeout=15) as cli:
            r = await cli.post(rpc, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getSignaturesForAddress",
                "params": [wallet, {"limit": 50}],
            })
            sigs = r.json().get("result", [])

        # Get current SOL balance
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post(rpc, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getBalance",
                "params": [wallet],
            })
            lamports = r.json().get("result", {}).get("value", 0)

        sol_price  = await _get_sol_price_usd()
        sol_balance = lamports / 1e9
        balance_usd = sol_balance * sol_price

        # AI recommendation
        ai_rec = await gemini_brain.ask(
            f"A Solana wallet at {wallet[:8]}… has {sol_balance:.4f} SOL (${balance_usd:.2f}) "
            f"and {len(sigs)} recent transactions. Give 2-3 concise DeFi recommendations.",
            {"wallet": wallet}
        )

        result = {
            "wallet":           wallet,
            "sol_balance":      sol_balance,
            "balance_usd":      balance_usd,
            "total_volume_usd": 0,
            "pnl_usd":          0,
            "pnl_percent":      0,
            "top_tokens":       [{"token": "SOL", "value_usd": balance_usd}],
            "swap_history":     sigs[:10],
            "ai_recommendation": ai_rec,
            "tx_count":         len(sigs),
        }

        _analytics_cache[wallet] = (result, datetime.now(timezone.utc))
        return result

    except Exception as e:
        raise HTTPException(502, f"Analytics error: {e}")


@app.get("/api/pro/portfolio/{wallet}")
async def pro_portfolio(wallet: str, sub=Depends(require_pro)):
    rpc = SOLANA_RPC
    try:
        async with httpx.AsyncClient(timeout=10) as cli:
            r = await cli.post(rpc, json={
                "jsonrpc": "2.0", "id": 1,
                "method": "getBalance",
                "params": [wallet],
            })
            lamports = r.json().get("result", {}).get("value", 0)

        sol_price   = await _get_sol_price_usd()
        sol_balance = lamports / 1e9

        return {
            "wallet": wallet,
            "tokens": [
                {"symbol": "SOL", "balance": sol_balance, "usd_value": sol_balance * sol_price, "mint": "native"},
            ],
            "total_usd": sol_balance * sol_price,
            "sol_price": sol_price,
        }
    except Exception as e:
        raise HTTPException(502, f"Portfolio error: {e}")


@app.get("/api/pro/sniper/{wallet}")
async def pro_sniper(wallet: str, sub=Depends(require_pro)):
    try:
        birdeye_key = os.getenv("BIRDEYE_API_KEY")
        context_data = ""
        
        if birdeye_key:
            import httpx
            headers = {"X-API-KEY": birdeye_key, "x-chain": "solana"}
            async with httpx.AsyncClient() as client:
                res = await client.get("https://public-api.birdeye.so/defi/token_trending", headers=headers, timeout=10)
                if res.status_code == 200:
                    data = res.json().get("data", {}).get("tokens", [])
                    top_tokens = []
                    for t in data[:15]:
                        top_tokens.append({
                            "symbol": t.get("symbol"),
                            "volume24h": t.get("volume24hUSD", 0),
                            "liquidity": t.get("liquidity", 0),
                        })
                    context_data = "Here is real-time trending data from Birdeye:\n" + json.dumps(top_tokens)

        if not context_data:
            # If no API key or fetch failed, Gemini won't know real tokens so we return empty.
            return {"wallet": wallet, "opportunities": []}

        prompt = (
            "You are a Solana token sniper AI. Analyze the following real-time trending tokens data:\n"
            f"{context_data}\n\n"
            "Pick the 3-5 best opportunities based on volume and liquidity. "
            "Return JSON only: [{\"token\":\"SYMBOL\",\"score\":85,\"reason\":\"...\",\"risk_level\":\"low|medium|high\"}]"
        )
        result = await gemini_brain.ask(prompt, {"wallet": wallet})
        try:
            if "```" in result:
                result = result.split("```")[1]
                if result.startswith("json"):
                    result = result[4:]
            opportunities = json.loads(result.strip())
        except Exception:
            opportunities = []

        return {"wallet": wallet, "opportunities": opportunities}
    except Exception as e:
        log.error(f"Sniper error: {e}")
        return {"wallet": wallet, "opportunities": []}


@app.post("/api/pro/alerts")
async def save_pro_alerts(body: SaveProAlertsRequest, sub=Depends(require_pro)):
    await db.upsert_pro_alerts(
        body.wallet,
        price_targets=body.price_targets,
        whale_threshold=body.whale_threshold,
        custom_triggers=body.custom_triggers,
        ai_insights=body.ai_insights,
    )
    return {"status": "ok"}


@app.get("/api/pro/alerts/{wallet}")
async def get_pro_alerts_endpoint(wallet: str, sub=Depends(require_pro)):
    cfg = await db.get_pro_alerts(wallet)
    if not cfg:
        return {"wallet": wallet, "price_targets": "[]", "whale_threshold": 10000, "ai_insights": 1}
    return cfg


# --------------------------------------------------------------------------- #
# Admin endpoints
# --------------------------------------------------------------------------- #
@app.get("/admin/stats")
async def admin_stats(admin=Depends(admin_dep("viewer"))):
    stats = await db.get_admin_stats()
    # Also get active DCA tasks count
    try:
        import dca_engine as _dca
        stats["active_dca_tasks"] = len(getattr(_dca, "_tasks", {}))
    except Exception:
        stats["active_dca_tasks"] = 0
    return stats


@app.get("/admin/users")
async def admin_users(
    page: int = 1,
    limit: int = 50,
    plan: Optional[str] = None,
    sort: str = "created_at",
    admin=Depends(admin_dep("viewer")),
):
    return await db.get_admin_users_list(page=page, limit=min(limit, 100), plan=plan, sort=sort)


@app.get("/admin/users/{wallet}")
async def admin_user_detail(wallet: str, admin=Depends(admin_dep("viewer"))):
    user = await db.get_user(wallet)
    if not user:
        raise HTTPException(404, "User not found")
    sub    = await db.get_subscription(wallet)
    alerts = await db.get_pro_alerts(wallet)
    recent_swaps_data = await db.get_recent_swaps(10)
    user_swaps = [s for s in recent_swaps_data if s.get("wallet") == wallet]
    return {
        "user":         user,
        "subscription": sub,
        "pro_alerts":   alerts,
        "recent_swaps": user_swaps,
    }


@app.post("/admin/users/{wallet}/upgrade")
async def admin_upgrade(wallet: str, body: AdminUpgradeRequest, admin=Depends(admin_dep("admin"))):
    now        = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=body.days)).isoformat()
    await db.upsert_subscription(
        wallet,
        plan=body.plan,
        started_at=now.isoformat(),
        expires_at=expires_at,
    )
    log.info("Admin %s upgraded wallet %s to %s (%dd)", admin["wallet"][:8], wallet[:8], body.plan, body.days)
    return {"status": "ok", "plan": body.plan, "expires_at": expires_at}


@app.post("/admin/users/{wallet}/downgrade")
async def admin_downgrade(wallet: str, admin=Depends(admin_dep("admin"))):
    await db.upsert_subscription(wallet, plan="free", auto_renew=0)
    log.info("Admin %s downgraded wallet %s to free", admin["wallet"][:8], wallet[:8])
    return {"status": "ok", "plan": "free"}


@app.get("/admin/revenue")
async def admin_revenue(admin=Depends(admin_dep("viewer"))):
    return await db.get_admin_revenue()


@app.get("/admin/swaps")
async def admin_swaps(limit: int = 50, admin=Depends(admin_dep("viewer"))):
    return {"swaps": await db.get_recent_swaps(min(limit, 200))}


@app.post("/admin/team")
async def admin_add_team(body: AddTeamRequest, admin=Depends(admin_dep("superadmin"))):
    if body.role not in ROLE_HIERARCHY:
        raise HTTPException(400, f"Invalid role. Must be one of: {list(ROLE_HIERARCHY.keys())}")
    await db.upsert_admin_user(body.wallet, role=body.role, name=body.name)
    log.info("Superadmin %s added team member %s as %s", admin["wallet"][:8], body.wallet[:8], body.role)
    return {"status": "ok", "wallet": body.wallet, "role": body.role}


@app.delete("/admin/team/{wallet}")
async def admin_remove_team(wallet: str, admin=Depends(admin_dep("superadmin"))):
    # Prevent self-removal
    if wallet == admin["wallet"]:
        raise HTTPException(400, "Cannot remove yourself from admin team")
    await db.delete_admin_user(wallet)
    log.info("Superadmin %s removed team member %s", admin["wallet"][:8], wallet[:8])
    return {"status": "ok"}


@app.get("/admin/team")
async def admin_get_team(admin=Depends(admin_dep("viewer"))):
    return {"team": await db.get_all_admin_users()}


# --------------------------------------------------------------------------- #
# WebSocket: real-time TX push
# --------------------------------------------------------------------------- #
@app.websocket("/ws/{wallet}")
async def websocket_endpoint(ws: WebSocket, wallet: str, cluster: str = "mainnet-beta"):
    await ws.accept()
    log.info("[WS] New connection [%s]: %s…%s", cluster, wallet[:6], wallet[-4:])

    user = await db.get_user(wallet)
    stored_cluster = (user.get("cluster", "mainnet-beta") if user else cluster)
    active_cluster = stored_cluster

    queue = solana_monitor.register(wallet, active_cluster)

    await ws.send_json({
        "type":    "connected",
        "wallet":  wallet,
        "message": f"👋 Zola AI monitoring {wallet[:6]}…{wallet[-6:]}",
    })

    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=20)
                await ws.send_json(event)
            except asyncio.TimeoutError:
                await ws.send_json({"type": "ping"})
    except WebSocketDisconnect:
        log.info("[WS] Disconnected: %s…%s", wallet[:6], wallet[-4:])
    except Exception as e:
        log.error("[WS] Error for %s: %s", wallet[:6], e)
    finally:
        solana_monitor.unregister(wallet)
