"""
Zola AI — Telegram Bot (fixed)
- Deletes any stale webhook on startup so polling works
- Handles /start, /link <code>
- Exposes send_alert(chat_id, text) for solana_monitor
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

# Suppress harmless Conflict tracebacks during uvicorn --reload when old worker is killed
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

# ── Handlers ─────────────────────────────────────────────────────────────────
async def _start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    # Deep-link: t.me/bot?start=CODE  →  Telegram sends "/start CODE"
    args = ctx.args or []
    if args:
        # Treat the argument as a link code and auto-link
        ctx.args = args  # keep for reuse
        await _link(update, ctx)
        return

    await update.message.reply_text(
        "👋 *Welcome to Zola AI!*\n\n"
        "To receive wallet activity alerts, go to your Zola dashboard and click "
        "*Connect* next to Telegram — you'll be brought right back here to finish linking.\n\n"
        "Or type `/link CODE` if you already have a code.",
        parse_mode="Markdown",
    )


async def _link(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    chat_id = str(update.effective_chat.id)
    args = ctx.args or []

    if not args:
        await update.message.reply_text(
            "❌ Please include your code: `/link A3F9C2`\n"
            "Get your code from the Zola dashboard → Accounts.",
            parse_mode="Markdown",
        )
        return

    code = args[0].strip().upper()
    user = await find_by_link_code(code)

    if not user:
        await update.message.reply_text(
            "❌ *Code not found or already used.*\n\n"
            "Generate a new one from your Zola dashboard.",
            parse_mode="Markdown",
        )
        return

    wallet = user["wallet"]
    await upsert_user(wallet, tg_chat_id=chat_id)
    await clear_link_code(wallet)

    short = f"{wallet[:6]}…{wallet[-6:]}"
    await update.message.reply_text(
        f"✅ *Linked!*\n\n"
        f"You'll now receive real-time alerts for:\n"
        f"`{short}`\n\n"
        f"Transactions, balance changes, and bot activity will be sent here.",
        parse_mode="Markdown",
    )
    log.info("TG linked: chat=%s wallet=%s", chat_id, wallet)


async def _connect(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return
    
    chat_id = str(update.effective_chat.id)
    
    from db import get_user_by_tg_chat_id
    user_row = await get_user_by_tg_chat_id(chat_id)
    if not user_row:
        await update.message.reply_text("❌ Please run /link first by visiting your Zola dashboard.")
        return
        
    wallet = user_row.get("wallet")
    args = ctx.args or []
    if not args:
        await update.message.reply_text(
            "🔑 *Connect Wallet*\n\n"
            "To enable Gemini to execute swaps and transfers autonomously, please provide the private key for your connected wallet:\n"
            f"`{wallet}`\n\n"
            "**Command format:**\n"
            "`/connect YOUR_BASE58_PRIVATE_KEY`\n\n"
            "Your key will be securely AES-encrypted on the server and never shown again.",
            parse_mode="Markdown"
        )
        return
        
    privkey = args[0].strip()
    try:
        import wallet_store
        wallet_store.store_private_key(wallet, privkey)
        try:
            await update.message.delete()
        except:
            pass # Not an admin
            
        await update.message.reply_text(
            "✅ *Wallet Connected & Secured!*\n\n"
            "Your private key has been encrypted and securely stored. "
            "You can now ask Gemini to execute swaps and sends autonomously.",
            parse_mode="Markdown"
        )
    except Exception as e:
        await update.message.reply_text(f"❌ *Error linking wallet:*\n{e}", parse_mode="Markdown")


async def _handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Handle all natural language messages via Gemini."""
    if not update.message or not update.message.text:
        return

    chat_id = str(update.effective_chat.id)
    text = update.message.text
    
    # 1. Find user by chat_id
    from db import DB_PATH
    import aiosqlite
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM users WHERE tg_chat_id = ?", (chat_id,))
        user_row = await cur.fetchone()

    # If user isn't linked, just let Gemini chat generically
    wallet = user_row["wallet"] if user_row else ""
    cluster = user_row["cluster"] if user_row else "mainnet-beta"
    context_dict = {"wallet": wallet, "cluster": cluster, "wallet_connected": bool(wallet)}

    # If no wallet, limit the interaction
    if not wallet:
        await update.message.reply_text(
            "👋 Please link your Zola account from the dashboard (Accounts section) first!"
        )
        return

    # Call Gemini to interpret and execute the command natively
    response_text = await gemini_brain.interpret_command(text, wallet, context_dict)

    # Always send Gemini's human-friendly response
    await update.message.reply_text(response_text)


async def _error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):
    """Log the error and gracefully ignore telegram Conflicts from alternate uvicorn workers."""
    if isinstance(context.error, telegram.error.Conflict):
        log.warning("Telegram polling conflict ignored: another worker is active.")
    else:
        log.error("Telegram bot unhandled exception: %s", context.error)

# ── Public helpers ────────────────────────────────────────────────────────────
async def send_alert(chat_id: str, text: str):
    """Push a message to a Telegram chat."""
    if not _app:
        log.warning("TG app not initialised — cannot send alert")
        return
    try:
        await _app.bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="Markdown",
            disable_web_page_preview=True,
        )
    except Exception as e:
        log.error("TG send_alert error: %s", e)


async def start(token: str = TELEGRAM_TOKEN):
    """Build and start the polling bot as a background task."""
    global _app
    if not token:
        log.warning("TELEGRAM_TOKEN not set — Telegram bot disabled")
        return

    _app = Application.builder().token(token).build()
    _app.add_handler(CommandHandler("start", _start))
    _app.add_handler(CommandHandler("link", _link))
    _app.add_handler(CommandHandler("connect", _connect))
    _app.add_handler(MessageHandler(filters.TEXT & (~filters.COMMAND), _handle_message))
    _app.add_error_handler(_error_handler)

    log.info("Initialising Telegram bot…")
    await _app.initialize()

    # ── Critical fix: delete any stale webhook so polling works ──
    try:
        await _app.bot.delete_webhook(drop_pending_updates=True)
        log.info("Webhook cleared ✅")
    except Exception as e:
        log.warning("Could not clear webhook: %s", e)

    # Delay polling start slightly to allow old uvicorn workers to cleanly shut down
    # and release the Telegram getUpdates lock without raising a Conflict traceback.
    await asyncio.sleep(3)

    try:
        await _app.start()
        await _app.updater.start_polling(
            drop_pending_updates=True,
            allowed_updates=Update.ALL_TYPES,
        )
        log.info("Telegram bot polling ✅  (send /start to your bot)")
    except telegram.error.Conflict:
        log.warning("Telegram bot conflict: Another instance is currently polling. Polling disabled for this worker.")
    except Exception as e:
        log.error("Telegram polling error: %s", e)

    # Keep running until cancelled
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
