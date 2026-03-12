"""
Zola AI — Telegram Bot (reconciled)
- Natural language first. Commands are setup-only, not the interface.
- /start   → onboarding only
- /link    → link wallet via dashboard code
- /connect → store AES-encrypted signing key for autonomous tx execution
- /help    → command reference
- All actual DeFi intent (swap, balance, send, DCA, analyze) → Gemini NL handler
- Uses HTML parse_mode throughout, matching system prompt templates exactly
"""

import asyncio
import logging
import os

from dotenv import load_dotenv
import telegram
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

import gemini_brain
from db import find_by_link_code, upsert_user, clear_link_code

load_dotenv()

log = logging.getLogger("zola.tg")

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")

_app: Application | None = None


# ── Conflict Filter ───────────────────────────────────────────────────────────

class ConflictFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        if "terminated by other getUpdates request" in msg:
            return False
        if record.exc_info:
            _, exc_value, _ = record.exc_info
            if "terminated by other getUpdates request" in str(exc_value):
                return False
        return True


logging.getLogger("telegram.ext._updater").addFilter(ConflictFilter())
logging.getLogger("telegram.ext.Updater").addFilter(ConflictFilter())
logging.getLogger("httpx").addFilter(ConflictFilter())


# ── /start ────────────────────────────────────────────────────────────────────

async def _start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    # Deep link: /start <code> → auto-link
    args = ctx.args or []
    if args:
        ctx.args = args
        await _link(update, ctx)
        return

    await update.message.reply_text(
        "⚡ <b>Zola AI</b> — Solana DeFi, no detours.\n\n"
        "Link your wallet from the <b>Zola dashboard</b>, then just talk:\n\n"
        "<code>swap 2 SOL to USDC</code>\n"
        "<code>what's my balance</code>\n"
        "<code>DCA $50 into JTO every 24h</code>\n"
        "<code>analyze BONK</code>\n\n"
        "Already have a link code? <code>/link CODE</code>",
        parse_mode="HTML",
    )


# ── /link ─────────────────────────────────────────────────────────────────────

async def _link(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    chat_id = str(update.effective_chat.id)
    args = ctx.args or []

    if not args:
        await update.message.reply_text(
            "Need your link code:\n<code>/link A3F9C2</code>\n\n"
            "Get it from <b>Zola Dashboard → Accounts</b>.",
            parse_mode="HTML",
        )
        return

    code = args[0].strip().upper()
    user = await find_by_link_code(code)

    if not user:
        await update.message.reply_text(
            "❌ <b>Code not found or already used.</b>\n\n"
            "Generate a fresh one from your dashboard.",
            parse_mode="HTML",
        )
        return

    wallet = user["wallet"]
    await upsert_user(wallet, tg_chat_id=chat_id)
    await clear_link_code(wallet)

    short = f"{wallet[:6]}…{wallet[-4:]}"

    await update.message.reply_text(
        f"✅ <b>Linked.</b>\n\n"
        f"<code>{short}</code>\n\n"
        f"Alerts and trade execution are live. "
        f"To enable autonomous trading, connect your signing key from the <b>Zola dashboard</b> — not here.",
        parse_mode="HTML",
    )

    log.info("TG linked: chat=%s wallet=%s", chat_id, wallet)


# ── /help ─────────────────────────────────────────────────────────────────────

async def _help(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    await update.message.reply_text(
        "🔍 <b>What Zola can do</b>\n"
        "──────────────\n"
        "<b>Trading</b>\n"
        "<code>swap 1 SOL to USDC</code>\n"
        "<code>buy $100 of BONK</code>\n\n"
        "<b>Portfolio</b>\n"
        "<code>show my balance</code>\n"
        "<code>my PnL on JTO</code>\n\n"
        "<b>DCA</b>\n"
        "<code>DCA $25 into SOL every 12 hours</code>\n\n"
        "<b>Research</b>\n"
        "<code>analyze WIF</code>\n"
        "<code>rug check [token address]</code>\n\n"
        "<b>Send</b>\n"
        "<code>send 0.5 SOL to [address]</code>\n"
        "──────────────\n"
        "<b>Setup</b>\n"
        "<code>/link CODE</code> — link your wallet\n"
        "<code>/connect KEY</code> — enable autonomous trading\n",
        parse_mode="HTML",
    )


# ── /connect ─────────────────────────────────────────────────────────────────

async def _connect(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    chat_id = str(update.effective_chat.id)

    from db import get_user_by_tg_chat_id
    user_row = await get_user_by_tg_chat_id(chat_id)

    if not user_row:
        await update.message.reply_text(
            "❌ Link your wallet first with <code>/link CODE</code>.",
            parse_mode="HTML",
        )
        return

    wallet = user_row.get("wallet")
    args   = ctx.args or []

    if not args:
        short = f"{wallet[:6]}…{wallet[-4:]}" if wallet else "unknown"
        await update.message.reply_text(
            "🔑 <b>Connect Signing Key</b>\n"
            "──────────────\n"
            f"Wallet: <code>{short}</code>\n\n"
            "Provide your Base58 private key to enable autonomous trading:\n"
            "<code>/connect YOUR_BASE58_PRIVATE_KEY</code>\n\n"
            "<i>Key is AES-encrypted server-side. Delete this message after sending.</i>",
            parse_mode="HTML",
        )
        return

    privkey = args[0].strip()

    # Immediately delete the message containing the key
    try:
        await update.message.delete()
    except Exception:
        pass

    try:
        import wallet_store
        wallet_store.store_private_key(wallet, privkey)

        await update.message.reply_text(
            "✅ <b>Signing key stored.</b>\n\n"
            "Encrypted and locked. Zola can now execute swaps and transfers autonomously.",
            parse_mode="HTML",
        )
        log.info("Signing key stored for wallet=%s", wallet)

    except Exception as e:
        await update.message.reply_text(
            f"❌ <b>Failed to store key:</b>\n<code>{e}</code>",
            parse_mode="HTML",
        )


# ── Private Key Warning ───────────────────────────────────────────────────────
# Catches accidental key pastes in plain chat (outside /connect).
# /connect is the correct channel — anything else gets deleted and warned.

import re

_B58_PATTERN = re.compile(r'[1-9A-HJ-NP-Za-km-z]{86,88}')

async def _check_privkey_leak(update: Update) -> bool:
    """Returns True if message looks like a raw private key (and sends warning)."""
    text = update.message.text or ""
    if _B58_PATTERN.search(text):
        try:
            await update.message.delete()
        except Exception:
            pass
        await update.message.reply_text(
            "🚨 <b>That looks like a private key.</b>\n\n"
            "Message deleted. <b>Never share your private key in chat</b> — "
            "with Zola or anyone else. Connect your signing key securely from the "
            "<b>Zola dashboard</b> only.",
            parse_mode="HTML",
        )
        return True
    return False


# ── Natural Language Handler (all DeFi intent goes here) ─────────────────────

async def _handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    # Safety: intercept accidental key pastes before Gemini sees them
    if await _check_privkey_leak(update):
        return

    chat_id = str(update.effective_chat.id)
    text = update.message.text

    import aiosqlite
    from db import DB_PATH

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM users WHERE tg_chat_id = ?", (chat_id,))
        user_row = await cur.fetchone()

    if not user_row:
        await update.message.reply_text(
            "Link your wallet first — run <code>/start</code> or get a code from the dashboard.",
            parse_mode="HTML",
        )
        return

    wallet  = user_row["wallet"]
    cluster = user_row["cluster"] if user_row["cluster"] else "mainnet-beta"

    context_dict = {
        "wallet": wallet,
        "cluster": cluster,
    }

    # Show typing indicator for longer Gemini calls
    await ctx.bot.send_chat_action(chat_id=chat_id, action="typing")

    response_text = await gemini_brain.interpret_command(text, wallet, context_dict)

    await update.message.reply_text(
        response_text,
        parse_mode="HTML",
        disable_web_page_preview=True,
    )


# ── Error Handler ─────────────────────────────────────────────────────────────

async def _error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    if isinstance(context.error, telegram.error.Conflict):
        log.warning("Telegram polling conflict — another instance running.")
    else:
        log.error("Telegram bot exception: %s", context.error)


# ── Alert Sender (used by solana_monitor) ────────────────────────────────────

async def send_alert(chat_id: str, text: str):
    if not _app:
        log.warning("TG app not initialised — cannot send alert")
        return
    try:
        await _app.bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="HTML",
            disable_web_page_preview=True,
        )
    except Exception as e:
        log.error("TG send_alert error: %s", e)


# ── Start Bot ─────────────────────────────────────────────────────────────────

async def start(token: str = TELEGRAM_TOKEN):
    global _app

    if not token:
        log.warning("TELEGRAM_TOKEN not set — Telegram bot disabled")
        return

    _app = Application.builder().token(token).build()

    # Setup commands only — DeFi intent handled by NL
    _app.add_handler(CommandHandler("start",   _start))
    _app.add_handler(CommandHandler("link",    _link))
    _app.add_handler(CommandHandler("connect", _connect))
    _app.add_handler(CommandHandler("help",    _help))

    # Everything else → Gemini
    _app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), _handle_message))

    _app.add_error_handler(_error_handler)

    log.info("Initialising Telegram bot…")
    await _app.initialize()

    try:
        await _app.bot.delete_webhook(drop_pending_updates=True)
        log.info("Webhook cleared ✅")
    except Exception as e:
        log.warning("Could not clear webhook: %s", e)

    await asyncio.sleep(3)

    try:
        await _app.start()
        await _app.updater.start_polling(
            drop_pending_updates=True,
            allowed_updates=Update.ALL_TYPES,
        )
        log.info("Telegram bot polling ✅")
    except telegram.error.Conflict:
        log.warning("Another instance already polling — this one standing down.")

    while True:
        await asyncio.sleep(3600)


async def stop():
    global _app
    if _app:
        try:
            await _app.updater.stop()
            await _app.stop()
            await _app.shutdown()
        except Exception as e:
            log.warning("TG stop error: %s", e)
