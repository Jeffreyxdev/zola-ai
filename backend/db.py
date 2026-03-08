"""
Zola AI — async SQLite user database
Tables:
  users(wallet, tg_chat_id, tg_link_code, twitter_handle, cluster, created_at)
"""
import asyncio
import aiosqlite
import os
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("DB_PATH", "./zola.db")

# --------------------------------------------------------------------------- #
# Schema
# --------------------------------------------------------------------------- #
CREATE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    wallet          TEXT PRIMARY KEY,
    tg_chat_id      TEXT,
    tg_link_code    TEXT,
    twitter_handle  TEXT,
    cluster         TEXT NOT NULL DEFAULT 'mainnet-beta',
    encrypted_privkey TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);
"""

# Safe migration for existing DBs that don't have the cluster column yet
MIGRATE_SQL_CLUSTER = "ALTER TABLE users ADD COLUMN cluster TEXT NOT NULL DEFAULT 'mainnet-beta'"
MIGRATE_SQL_PRIVKEY = "ALTER TABLE users ADD COLUMN encrypted_privkey TEXT"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_SQL)
        # Add column to existing DBs (idempotent)
        try:
            await db.execute(MIGRATE_SQL_CLUSTER)
        except Exception:
            pass  # Column already exists
        try:
            await db.execute(MIGRATE_SQL_PRIVKEY)
        except Exception:
            pass
        await db.commit()
    import wallet_store; wallet_store.init_wallet_keys_table()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
async def upsert_user(wallet: str, **fields):
    """Create or update a user row. Only provided fields are updated."""
    async with aiosqlite.connect(DB_PATH) as db:
        # Ensure row exists
        await db.execute(
            "INSERT OR IGNORE INTO users (wallet) VALUES (?)", (wallet,)
        )
        for col, val in fields.items():
            await db.execute(
                f"UPDATE users SET {col} = ? WHERE wallet = ?", (val, wallet)
            )
        await db.commit()


async def get_user(wallet: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM users WHERE wallet = ?", (wallet,)
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_user_by_tg_chat_id(tg_chat_id: str) -> dict | None:
    """
    Look up a user row by their Telegram chat ID.
    Used by connect_handlers.py to find which wallet is linked to a Telegram user.
    Returns the full user row dict, or None if not found.
    """
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM users WHERE tg_chat_id = ?",
            (tg_chat_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return dict(row) if row else None


async def find_by_link_code(code: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM users WHERE tg_link_code = ?", (code,)
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def find_by_twitter(handle: str) -> dict | None:
    """Lookup by Twitter handle (case-insensitive, without @)."""
    handle_clean = handle.lstrip("@").lower()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM users WHERE lower(trim(twitter_handle, '@')) = ?",
            (handle_clean,),
        )
        row = await cur.fetchone()
        return dict(row) if row else None


async def clear_link_code(wallet: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET tg_link_code = NULL WHERE wallet = ?", (wallet,)
        )
        await db.commit()


async def get_all_monitored_wallets() -> list[dict]:
    """Return all wallets that have a linked Telegram chat ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT wallet, cluster FROM users WHERE tg_chat_id IS NOT NULL AND tg_chat_id != ''"
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]
