"""
Zola AI — async SQLite user database
Tables:
  users(wallet, tg_chat_id, tg_link_code, twitter_handle, cluster, created_at)
  subscriptions(wallet, plan, payment_token, amount_usd, started_at, expires_at, auto_renew, last_charged, tx_signature)
  payments(id, wallet, amount_sol, amount_usdc, token, tx_signature, status, created_at)
  swap_fees(id, wallet, token_in, token_out, amount_in, fee_collected, fee_usd, tx_signature, cluster, created_at)
  pro_alerts(wallet, price_targets, whale_threshold, custom_triggers, ai_insights)
  admin_users(wallet, role, name, added_at)
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

CREATE_SUBSCRIPTIONS_SQL = """
CREATE TABLE IF NOT EXISTS subscriptions (
    wallet          TEXT PRIMARY KEY,
    plan            TEXT DEFAULT 'free',
    payment_token   TEXT DEFAULT 'SOL',
    amount_usd      REAL DEFAULT 6.0,
    started_at      TEXT,
    expires_at      TEXT,
    auto_renew      INTEGER DEFAULT 1,
    last_charged    TEXT,
    tx_signature    TEXT
);
"""

CREATE_PAYMENTS_SQL = """
CREATE TABLE IF NOT EXISTS payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet          TEXT NOT NULL,
    amount_sol      REAL,
    amount_usdc     REAL,
    token           TEXT,
    tx_signature    TEXT,
    status          TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);
"""

CREATE_SWAP_FEES_SQL = """
CREATE TABLE IF NOT EXISTS swap_fees (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet          TEXT NOT NULL,
    token_in        TEXT,
    token_out       TEXT,
    amount_in       REAL,
    fee_collected   REAL,
    fee_usd         REAL,
    tx_signature    TEXT,
    cluster         TEXT DEFAULT 'mainnet-beta',
    created_at      TEXT DEFAULT (datetime('now'))
);
"""

CREATE_PRO_ALERTS_SQL = """
CREATE TABLE IF NOT EXISTS pro_alerts (
    wallet          TEXT PRIMARY KEY,
    price_targets   TEXT,
    whale_threshold REAL DEFAULT 10000,
    custom_triggers TEXT,
    ai_insights     INTEGER DEFAULT 1
);
"""

CREATE_ADMIN_USERS_SQL = """
CREATE TABLE IF NOT EXISTS admin_users (
    wallet          TEXT PRIMARY KEY,
    role            TEXT DEFAULT 'viewer',
    name            TEXT,
    added_at        TEXT DEFAULT (datetime('now'))
);
"""

# Safe migration for existing DBs that don't have the cluster column yet
MIGRATE_SQL_CLUSTER = "ALTER TABLE users ADD COLUMN cluster TEXT NOT NULL DEFAULT 'mainnet-beta'"
MIGRATE_SQL_PRIVKEY = "ALTER TABLE users ADD COLUMN encrypted_privkey TEXT"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(CREATE_SQL)
        await db.execute(CREATE_SUBSCRIPTIONS_SQL)
        await db.execute(CREATE_PAYMENTS_SQL)
        await db.execute(CREATE_SWAP_FEES_SQL)
        await db.execute(CREATE_PRO_ALERTS_SQL)
        await db.execute(CREATE_ADMIN_USERS_SQL)
        # Add columns to existing DBs (idempotent)
        for migration in [MIGRATE_SQL_CLUSTER, MIGRATE_SQL_PRIVKEY]:
            try:
                await db.execute(migration)
            except Exception:
                pass  # Column already exists
        await db.commit()
    import wallet_store; wallet_store.init_wallet_keys_table()

    # Seed superadmin wallets from env
    import os
    admin_wallets_env = os.getenv("ADMIN_WALLETS", "")
    if admin_wallets_env:
        for w in [x.strip() for x in admin_wallets_env.split(",") if x.strip()]:
            await upsert_admin_user(w, role="superadmin", name="Owner")


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


# --------------------------------------------------------------------------- #
# Subscription CRUD
# --------------------------------------------------------------------------- #
async def get_subscription(wallet: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM subscriptions WHERE wallet = ?", (wallet,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def upsert_subscription(wallet: str, **fields):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT OR IGNORE INTO subscriptions (wallet) VALUES (?)", (wallet,))
        for col, val in fields.items():
            await db.execute(f"UPDATE subscriptions SET {col} = ? WHERE wallet = ?", (val, wallet))
        await db.commit()


async def get_expiring_subscriptions() -> list[dict]:
    """Return subscriptions expiring within 24h with auto_renew=1."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("""
            SELECT * FROM subscriptions
            WHERE plan = 'pro'
              AND auto_renew = 1
              AND expires_at IS NOT NULL
              AND datetime(expires_at) <= datetime('now', '+24 hours')
              AND datetime(expires_at) > datetime('now')
        """)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


async def get_all_pro_wallets() -> list[dict]:
    """Return all active pro subscriptions."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM subscriptions WHERE plan = 'pro'"
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# Payment logging
# --------------------------------------------------------------------------- #
async def log_payment(
    wallet: str,
    amount_sol: float | None,
    amount_usdc: float | None,
    token: str,
    tx_signature: str,
    status: str,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO payments (wallet, amount_sol, amount_usdc, token, tx_signature, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (wallet, amount_sol, amount_usdc, token, tx_signature, status))
        await db.commit()


# --------------------------------------------------------------------------- #
# Swap fee logging
# --------------------------------------------------------------------------- #
async def log_swap_fee(
    wallet: str,
    token_in: str,
    token_out: str,
    amount_in: float,
    fee_usd: float,
    tx_signature: str,
    cluster: str = "mainnet-beta",
    fee_collected: float = 0.0,
):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO swap_fees (wallet, token_in, token_out, amount_in, fee_collected, fee_usd, tx_signature, cluster)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (wallet, token_in, token_out, amount_in, fee_collected, fee_usd, tx_signature, cluster))
        await db.commit()


# --------------------------------------------------------------------------- #
# Pro Alerts CRUD
# --------------------------------------------------------------------------- #
async def get_pro_alerts(wallet: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM pro_alerts WHERE wallet = ?", (wallet,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def upsert_pro_alerts(wallet: str, **fields):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("INSERT OR IGNORE INTO pro_alerts (wallet) VALUES (?)", (wallet,))
        for col, val in fields.items():
            await db.execute(f"UPDATE pro_alerts SET {col} = ? WHERE wallet = ?", (val, wallet))
        await db.commit()


async def get_all_pro_alerts() -> list[dict]:
    """Return pro_alerts rows for all wallets that are currently pro."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("""
            SELECT pa.* FROM pro_alerts pa
            INNER JOIN subscriptions s ON pa.wallet = s.wallet
            WHERE s.plan = 'pro'
        """)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# Admin Users CRUD
# --------------------------------------------------------------------------- #
async def get_admin_user(wallet: str) -> dict | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM admin_users WHERE wallet = ?", (wallet,))
        row = await cur.fetchone()
        return dict(row) if row else None


async def upsert_admin_user(wallet: str, role: str = "viewer", name: str | None = None):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO admin_users (wallet, role, name)
            VALUES (?, ?, ?)
            ON CONFLICT(wallet) DO UPDATE SET role = excluded.role, name = COALESCE(excluded.name, name)
        """, (wallet, role, name))
        await db.commit()


async def delete_admin_user(wallet: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM admin_users WHERE wallet = ?", (wallet,))
        await db.commit()


async def get_all_admin_users() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM admin_users ORDER BY added_at DESC")
        rows = await cur.fetchall()
        return [dict(r) for r in rows]


# --------------------------------------------------------------------------- #
# Admin Stats Queries
# --------------------------------------------------------------------------- #
async def get_admin_stats() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        async def scalar(sql, *args):
            cur = await db.execute(sql, args)
            row = await cur.fetchone()
            return (list(dict(row).values())[0] if row else 0) or 0

        total_users       = await scalar("SELECT COUNT(*) FROM users")
        pro_users         = await scalar("SELECT COUNT(*) FROM subscriptions WHERE plan='pro'")
        free_users        = total_users - pro_users
        total_volume      = await scalar("SELECT COALESCE(SUM(amount_in),0) FROM swap_fees")
        total_fee_rev     = await scalar("SELECT COALESCE(SUM(fee_usd),0) FROM swap_fees")
        total_pro_rev     = await scalar("SELECT COALESCE(SUM(amount_sol),0) FROM payments WHERE status='success' AND token='SOL'")
        total_pro_rev_usd = await scalar("SELECT COALESCE(SUM(amount_usdc),0) FROM payments WHERE status='success' AND token='USDC'")
        tg_linked         = await scalar("SELECT COUNT(*) FROM users WHERE tg_chat_id IS NOT NULL AND tg_chat_id != ''")
        tw_linked         = await scalar("SELECT COUNT(*) FROM users WHERE twitter_handle IS NOT NULL AND twitter_handle != ''")
        swaps_today       = await scalar("SELECT COUNT(*) FROM swap_fees WHERE date(created_at)=date('now')")
        swaps_month       = await scalar("SELECT COUNT(*) FROM swap_fees WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')")

        # 14-day trailing history for dashboard charts
        cur_history = await db.execute("""
            SELECT 
                date(created_at) as day, 
                COUNT(*) as swaps, 
                COALESCE(SUM(fee_usd), 0) as revenue
            FROM swap_fees
            WHERE created_at >= datetime('now', '-14 days')
            GROUP BY date(created_at)
            ORDER BY day ASC
        """)
        history_rows = await cur_history.fetchall()
        
        # Fill in missing days so the chart always displays a steady 14-day X-axis
        history_dict = {dict(row)["day"]: dict(row) for row in history_rows}
        filled_history = []
        from datetime import datetime, timedelta
        for i in range(13, -1, -1):
            d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            filled_history.append({
                "day": d,
                "swaps": history_dict.get(d, {}).get("swaps", 0),
                "revenue": history_dict.get(d, {}).get("revenue", 0.0),
            })

        return {
            "total_users": total_users,
            "pro_users": pro_users,
            "free_users": free_users,
            "total_volume_usd": total_volume,
            "total_fee_revenue_usd": total_fee_rev,
            "total_pro_revenue_usd": total_pro_rev + total_pro_rev_usd,
            "telegram_linked": tg_linked,
            "twitter_linked": tw_linked,
            "swaps_today": swaps_today,
            "swaps_this_month": swaps_month,
            "chart_history": filled_history,
        }


async def get_admin_users_list(
    page: int = 1,
    limit: int = 50,
    plan: str | None = None,
    sort: str = "created_at",
) -> dict:
    offset = (page - 1) * limit
    where = "WHERE s.plan = ?" if plan else ""
    params: list = [plan] if plan else []

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        count_sql = f"""
            SELECT COUNT(*) as cnt FROM users u
            LEFT JOIN subscriptions s ON u.wallet=s.wallet
            {where}
        """
        cur = await db.execute(count_sql, params)
        total_row = await cur.fetchone()
        total = dict(total_row)["cnt"] if total_row else 0

        data_sql = f"""
            SELECT u.wallet, COALESCE(s.plan,'free') as plan,
                   CASE WHEN u.tg_chat_id IS NOT NULL AND u.tg_chat_id!='' THEN 1 ELSE 0 END as tg_linked,
                   CASE WHEN u.twitter_handle IS NOT NULL AND u.twitter_handle!='' THEN 1 ELSE 0 END as tw_linked,
                   u.cluster, u.created_at, s.expires_at,
                   (SELECT MAX(sf.created_at) FROM swap_fees sf WHERE sf.wallet=u.wallet) as last_swap,
                   COALESCE((SELECT SUM(sf.amount_in) FROM swap_fees sf WHERE sf.wallet=u.wallet),0) as total_volume
            FROM users u LEFT JOIN subscriptions s ON u.wallet=s.wallet
            {where}
            ORDER BY u.{sort} DESC LIMIT ? OFFSET ?
        """
        cur = await db.execute(data_sql, params + [limit, offset])
        rows = await cur.fetchall()
        return {"total": total, "page": page, "limit": limit, "users": [dict(r) for r in rows]}


async def get_admin_revenue() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        async def scalar(sql):
            cur = await db.execute(sql)
            row = await cur.fetchone()
            return (list(dict(row).values())[0] if row else 0) or 0

        today     = await scalar("SELECT COALESCE(SUM(fee_usd),0) FROM swap_fees WHERE date(created_at)=date('now')")
        week      = await scalar("SELECT COALESCE(SUM(fee_usd),0) FROM swap_fees WHERE created_at>=datetime('now','-7 days')")
        month     = await scalar("SELECT COALESCE(SUM(fee_usd),0) FROM swap_fees WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')")
        all_time  = await scalar("SELECT COALESCE(SUM(fee_usd),0) FROM swap_fees")
        sub_all   = await scalar("SELECT COALESCE(SUM(amount_usdc + COALESCE(amount_sol,0)),0) FROM payments WHERE status='success'")
        sol_rev   = await scalar("SELECT COALESCE(SUM(amount_sol),0) FROM payments WHERE status='success' AND token='SOL'")
        usdc_rev  = await scalar("SELECT COALESCE(SUM(amount_usdc),0) FROM payments WHERE status='success' AND token='USDC'")

        # Daily fee revenue for last 30 days
        cur = await db.execute("""
            SELECT date(created_at) as day, SUM(fee_usd) as revenue
            FROM swap_fees
            WHERE created_at >= datetime('now','-30 days')
            GROUP BY date(created_at)
            ORDER BY day ASC
        """)
        chart_rows = await cur.fetchall()

        return {
            "today": today,
            "this_week": week,
            "this_month": month,
            "all_time": all_time,
            "by_token": {"SOL": sol_rev, "USDC": usdc_rev},
            "fee_revenue": all_time,
            "subscription_revenue": sub_all,
            "chart_data": [dict(r) for r in chart_rows],
        }


async def get_recent_swaps(limit: int = 50) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM swap_fees ORDER BY created_at DESC LIMIT ?", (limit,)
        )
        rows = await cur.fetchall()
        return [dict(r) for r in rows]
