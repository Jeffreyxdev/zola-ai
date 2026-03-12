"""
Zola AI — Telegram Bot (fixed)
- Uses HTML formatting for Telegram
- Deletes stale webhook so polling works
- Handles /start, /link <code>, /connect
- Exposes send_alert(chat_id, text)
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


# ── Logging Conflict Filter ───────────────────────────────────────────────

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


# ── /start ────────────────────────────────────────────────────────────────

async def _start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    args = ctx.args or []
    if args:
        ctx.args = args
        await _link(update, ctx)
        return

    await update.message.reply_text(
        "👋 <b>Welcome to Zola AI!</b>\n\n"
        "To receive wallet activity alerts, go to your Zola dashboard and click "
        "<b>Connect</b> next to Telegram.\n\n"
        "Or type <code>/link CODE</code> if you already have a code.",
        parse_mode="HTML",
    )


# ── /link ─────────────────────────────────────────────────────────────────

async def _link(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    chat_id = str(update.effective_chat.id)
    args = ctx.args or []

    if not args:
        await update.message.reply_text(
            "❌ Please include your code:\n<code>/link A3F9C2</code>\n\n"
            "Get your code from the Zola dashboard → Accounts.",
            parse_mode="HTML",
        )
        return

    code = args[0].strip().upper()
    user = await find_by_link_code(code)

    if not user:
        await update.message.reply_text(
            "❌ <b>Code not found or already used.</b>\n\n"
            "Generate a new one from your Zola dashboard.",
            parse_mode="HTML",
        )
        return

    wallet = user["wallet"]

    await upsert_user(wallet, tg_chat_id=chat_id)
    await clear_link_code(wallet)

    short = f"{wallet[:6]}…{wallet[-6:]}"

    await update.message.reply_text(
        f"✅ <b>Linked!</b>\n\n"
        f"You'll now receive real-time alerts for:\n"
        f"<code>{short}</code>\n\n"
        f"Transactions, balance changes, and bot activity will be sent here.",
        parse_mode="HTML",
    )

    log.info("TG linked: chat=%s wallet=%s", chat_id, wallet)


# ── /connect ──────────────────────────────────────────────────────────────

async def _connect(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message:
        return

    chat_id = str(update.effective_chat.id)

    from db import get_user_by_tg_chat_id

    user_row = await get_user_by_tg_chat_id(chat_id)

    if not user_row:
        await update.message.reply_text(
            "❌ Please run <code>/link</code> first from your Zola dashboard.",
            parse_mode="HTML"
        )
        return

    wallet = user_row.get("wallet")
    args = ctx.args or []

    if not args:
        await update.message.reply_text(
            "🔑 <b>Connect Wallet</b>\n\n"
            "To enable Gemini to execute swaps and transfers autonomously, "
            "provide the private key for your connected wallet:\n"
            f"<code>{wallet}</code>\n\n"
            "<b>Command format:</b>\n"
            "<code>/connect YOUR_BASE58_PRIVATE_KEY</code>\n\n"
            "Your key will be securely AES-encrypted on the server.",
            parse_mode="HTML"
        )
        return

    privkey = args[0].strip()

    try:
        import wallet_store
        wallet_store.store_private_key(wallet, privkey)

        try:
            await update.message.delete()
        except:
            pass

        await update.message.reply_text(
            "✅ <b>Wallet Connected & Secured!</b>\n\n"
            "Your private key has been encrypted and stored securely. "
            "Gemini can now execute swaps and transfers.",
            parse_mode="HTML"
        )

    except Exception as e:
        await update.message.reply_text(
            f"❌ <b>Error linking wallet:</b>\n{e}",
            parse_mode="HTML"
        )


# ── Natural Language (Gemini) ─────────────────────────────────────────────

async def _handle_message(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not update.message or not update.message.text:
        return

    chat_id = str(update.effective_chat.id)
    text = update.message.text

    from db import DB_PATH
    import aiosqlite

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM users WHERE tg_chat_id = ?", (chat_id,))
        user_row = await cur.fetchone()

    wallet = user_row["wallet"] if user_row else ""
    cluster = user_row["cluster"] if user_row else "mainnet-beta"

    context_dict = {
        "wallet": wallet,
        "cluster": cluster,
        "wallet_connected": bool(wallet)
    }

    if not wallet:
        await update.message.reply_text(
            "👋 Please link your Zola account from the dashboard first.",
            parse_mode="HTML"
        )
        return

    response_text = await gemini_brain.interpret_command(text, wallet, context_dict)

    await update.message.reply_text(
        response_text,
        parse_mode="HTML",
        disable_web_page_preview=True
    )


# ── Error Handler ─────────────────────────────────────────────────────────

async def _error_handler(update: object, context: ContextTypes.DEFAULT_TYPE):

    if isinstance(context.error, telegram.error.Conflict):
        log.warning("Telegram polling conflict ignored.")
    else:
        log.error("Telegram bot exception: %s", context.error)


# ── Alert Sender ──────────────────────────────────────────────────────────

async def send_alert(chat_id: str, text: str):

    if not _app:
        log.warning("TG app not initialised — cannot send alert")
        return

    try:
        await _app.bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="HTML",
            disable_web_page_preview=True
        )

    except Exception as e:
        log.error("TG send_alert error: %s", e)


# ── Start Bot ─────────────────────────────────────────────────────────────

async def start(token: str = TELEGRAM_TOKEN):

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
        log.warning("Another instance already polling.")

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