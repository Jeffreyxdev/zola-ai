"""
Zola AI — DCA (Dollar-Cost Averaging) Engine
- Stores DCA tasks per wallet in SQLite
- Background loop checks due tasks every 60 seconds
- Before each buy: asks Gemini to evaluate market conditions
- Simulates the swap (logs + alerts) — real swap via Jupiter can be added later
- Fires Telegram alert for every DCA action (executed or deferred)
"""
import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import aiosqlite
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("zola.dca")
DB_PATH = os.getenv("DB_PATH", "./zola.db")

_running = False


# ── DB Schema ─────────────────────────────────────────────────────────────────

DCA_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS dca_tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet      TEXT NOT NULL,
    token       TEXT NOT NULL,
    amount_usd  REAL NOT NULL,
    interval_h  INTEGER NOT NULL,
    next_run    TEXT NOT NULL,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
);
"""


async def _init_dca_table():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(DCA_TABLE_SQL)
        await db.commit()


# ── CRUD ──────────────────────────────────────────────────────────────────────

async def create_dca_task(wallet: str, token: str, amount_usd: float, interval_hours: int) -> int:
    """Create a new DCA task. Returns the task ID."""
    now = datetime.now(timezone.utc)
    next_run = (now + timedelta(hours=interval_hours)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "INSERT INTO dca_tasks (wallet, token, amount_usd, interval_h, next_run) VALUES (?, ?, ?, ?, ?)",
            (wallet, token.upper(), amount_usd, interval_hours, next_run),
        )
        await db.commit()
        task_id = cur.lastrowid
    log.info("DCA task created: id=%s wallet=%s… token=%s $%.2f every %dh",
             task_id, wallet[:6], token, amount_usd, interval_hours)
    return task_id


async def list_dca_tasks(wallet: str) -> list[dict]:
    """Return all active DCA tasks for a wallet."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM dca_tasks WHERE wallet = ? AND active = 1 ORDER BY id",
            (wallet,),
        )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def cancel_dca_task(task_id: int, wallet: str) -> bool:
    """Deactivate a DCA task. Returns True if found and cancelled."""
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "UPDATE dca_tasks SET active = 0 WHERE id = ? AND wallet = ?",
            (task_id, wallet),
        )
        await db.commit()
    return (cur.rowcount or 0) > 0


async def _get_due_tasks() -> list[dict]:
    """Return all active tasks whose next_run is in the past."""
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM dca_tasks WHERE active = 1 AND next_run <= ?",
            (now,),
        )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def _advance_next_run(task_id: int, interval_hours: int):
    next_run = (datetime.now(timezone.utc) + timedelta(hours=interval_hours)).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE dca_tasks SET next_run = ? WHERE id = ?",
            (next_run, task_id),
        )
        await db.commit()


# ── Execution Loop ────────────────────────────────────────────────────────────

async def _execute_task(task: dict):
    """
    Execute a single DCA task:
    1. Ask Gemini if market conditions are favourable
    2. Simulate the swap (log it)
    3. Send Telegram alert
    4. Advance next_run
    """
    from db import get_user
    try:
        import gemini_brain

        wallet    = task["wallet"]
        token     = task["token"]
        amount    = task["amount_usd"]
        task_id   = task["id"]
        interval  = task["interval_h"]

        log.info("DCA task #%d due: %s $%.2f → %s", task_id, wallet[:6], amount, token)

        # 1. Market analysis
        analysis = await gemini_brain.analyze_market(token)
        sentiment = analysis.get("sentiment", "neutral")
        summary   = analysis.get("summary", "")
        proceed   = analysis.get("dca_recommended", True)

        icon = "🟢" if sentiment == "bullish" else ("🔴" if sentiment == "bearish" else "🟡")

        if not proceed:
            # Defer this run — notify user but don't advance (retry next cycle)
            msg = (
                f"⏸ *DCA Deferred by AI*\n"
                f"💱 Task: ${amount:.2f} → {token}\n"
                f"{icon} Sentiment: {sentiment.capitalize()}\n"
                f"🧠 Reason: {summary}\n"
                f"⏭ Will retry next cycle."
            )
            log.info("DCA #%d deferred by Gemini (sentiment=%s)", task_id, sentiment)
        else:
            # 2. Execute swap via Jupiter Tool (simulated if no real private key)
            from gemini_brain import _tool_jupiter_swap
            swap_res = await _tool_jupiter_swap(f"simulated-{wallet}", "USDC", token, amount, "mainnet-beta")
            
            if "error" in swap_res:
                msg = f"❌ *DCA Failed*\nError: {swap_res['error']}"
                log.error("DCA swap failed for %s: %s", wallet, swap_res["error"])
            else:
                msg = (
                    f"✅ *DCA Executed*\n"
                    f"💱 Swapped ${amount:.2f} USDC → {token}\n"
                    f"💳 Wallet: `{wallet[:6]}…{wallet[-6:]}`\n"
                    f"{icon} Market: {sentiment.capitalize()}\n"
                    f"🧠 AI Analysis: {summary}\n"
                    f"⏭ Next run: in {interval}h"
                )
                log.info("DCA #%d executed: $%.2f USDC → %s via Jupiter", task_id, amount, token)
                # Advance next_run only on success
                await _advance_next_run(task_id, interval)

        # 3. Telegram alert
        user = await get_user(wallet)
        if user and user.get("tg_chat_id"):
            try:
                from telegram_bot import send_alert as tg_alert
                await tg_alert(user["tg_chat_id"], msg)
            except Exception as e:
                log.error("DCA TG alert error: %s", e)

    except Exception as e:
        log.error("DCA task #%d execution error: %s", task.get("id"), e)


async def _loop():
    """Background DCA engine loop — checks every 60 seconds."""
    global _running
    await _init_dca_table()
    log.info("DCA engine started ✅")
    while _running:
        try:
            due = await _get_due_tasks()
            if due:
                log.info("DCA engine: %d task(s) due", len(due))
                await asyncio.gather(*[_execute_task(t) for t in due])
        except Exception as e:
            log.error("DCA loop error: %s", e)
        await asyncio.sleep(60)


# ── Public start/stop ─────────────────────────────────────────────────────────

def start() -> asyncio.Task:
    global _running
    _running = True
    return asyncio.create_task(_loop())


def stop():
    global _running
    _running = False
