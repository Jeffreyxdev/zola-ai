"""
Zola AI — Wallet Store
=======================
Stores encrypted private keys per user, keyed by their Solana public key.
The public key comes from Phantom connect (already in your DB).
The private key is submitted once via Telegram /connect, then never asked again.

Table: wallet_keys
  public_key        TEXT PRIMARY KEY  — the Phantom-connected wallet address
  encrypted_privkey BLOB              — Fernet-encrypted base58 private key
  created_at        INTEGER
"""

import logging
import os
import sqlite3

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from solders.keypair import Keypair

load_dotenv()
log = logging.getLogger("zola.wallet_store")

_FERNET_KEY = os.getenv("WALLET_ENCRYPTION_KEY", "")
_DB_PATH    = os.getenv("DB_PATH", "zola.db")  # reuse your existing DB file

if not _FERNET_KEY:
    raise RuntimeError(
        "WALLET_ENCRYPTION_KEY not set in .env\n"
        "Generate one with: python3 -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
    )

_fernet = Fernet(_FERNET_KEY.encode() if isinstance(_FERNET_KEY, str) else _FERNET_KEY)


# ── DB Init ────────────────────────────────────────────────────────────────────

def init_wallet_keys_table():
    """
    Creates the wallet_keys table if it doesn't exist.
    Call this from your existing db.init_db() — add one line:
        import wallet_store; wallet_store.init_wallet_keys_table()
    """
    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS wallet_keys (
                public_key        TEXT PRIMARY KEY,
                encrypted_privkey BLOB NOT NULL,
                created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            )
        """)
        conn.commit()
    log.info("wallet_keys table ready")


# ── Core Operations ────────────────────────────────────────────────────────────

def store_private_key(public_key: str, privkey_b58: str) -> bool:
    """
    Validate the private key, confirm it matches the connected public key,
    encrypt it, and store it.

    Raises ValueError on bad key or key mismatch.
    Returns True on success.
    """
    try:
        keypair = Keypair.from_base58_string(privkey_b58.strip())
    except Exception:
        raise ValueError("Invalid private key — must be a base58 Solana private key.")

    # Confirm the private key belongs to the connected Phantom wallet
    derived_pubkey = str(keypair.pubkey())
    if derived_pubkey != public_key:
        raise ValueError(
            f"Key mismatch — this private key belongs to {derived_pubkey[:8]}…, "
            f"not your connected wallet {public_key[:8]}…\n"
            "Export the key from the same wallet you connected with Phantom."
        )

    encrypted = _fernet.encrypt(privkey_b58.strip().encode())

    with sqlite3.connect(_DB_PATH) as conn:
        conn.execute("""
            INSERT INTO wallet_keys (public_key, encrypted_privkey)
            VALUES (?, ?)
            ON CONFLICT(public_key) DO UPDATE SET
                encrypted_privkey = excluded.encrypted_privkey,
                created_at        = strftime('%s','now')
        """, (public_key, encrypted))
        conn.commit()

    log.info("Private key stored for wallet %s…", public_key[:8])
    return True


def get_user_wallet(public_key: str) -> str | None:
    """
    Decrypt and return the base58 private key for a wallet.
    Returns None if no key is stored.
    Called by _get_keypair() in gemini_brain.py.
    """
    with sqlite3.connect(_DB_PATH) as conn:
        row = conn.execute(
            "SELECT encrypted_privkey FROM wallet_keys WHERE public_key = ?",
            (public_key,)
        ).fetchone()

    if not row:
        return None

    try:
        return _fernet.decrypt(row[0]).decode()
    except Exception as e:
        log.error("Decrypt error for %s: %s", public_key[:8], e)
        return None


def has_private_key(public_key: str) -> bool:
    """Check if a wallet has a stored private key."""
    with sqlite3.connect(_DB_PATH) as conn:
        row = conn.execute(
            "SELECT 1 FROM wallet_keys WHERE public_key = ?",
            (public_key,)
        ).fetchone()
    return row is not None


def delete_private_key(public_key: str) -> bool:
    """Permanently wipe the stored private key for a wallet."""
    with sqlite3.connect(_DB_PATH) as conn:
        cur = conn.execute(
            "DELETE FROM wallet_keys WHERE public_key = ?",
            (public_key,)
        )
        conn.commit()
    removed = cur.rowcount > 0
    if removed:
        log.info("Private key deleted for wallet %s…", public_key[:8])
    return removed
def has_pro_plan(public_key: str) -> bool:
    """
    Synchronously check if a wallet has an active pro subscription.
    This is used by gemini_brain.py to gate analytics features.
    """
    with sqlite3.connect(_DB_PATH) as conn:
        row = conn.execute(
            "SELECT plan FROM subscriptions WHERE wallet = ?",
            (public_key,)
        ).fetchone()
    return row is not None and row[0] == 'pro'
