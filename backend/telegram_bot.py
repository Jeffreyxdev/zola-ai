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
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

from db import find_by_link_code, upsert_user, clear_link_code

load_dotenv()

log = logging.getLogger("zola.tg")

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")

_app: Application | None = None


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

    log.info("Initialising Telegram bot…")
    await _app.initialize()

    # ── Critical fix: delete any stale webhook so polling works ──
    try:
        await _app.bot.delete_webhook(drop_pending_updates=True)
        log.info("Webhook cleared ✅")
    except Exception as e:
        log.warning("Could not clear webhook: %s", e)

    await _app.start()
    await _app.updater.start_polling(
        drop_pending_updates=True,
        allowed_updates=Update.ALL_TYPES,
    )
    log.info("Telegram bot polling ✅  (send /start to your bot)")

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
