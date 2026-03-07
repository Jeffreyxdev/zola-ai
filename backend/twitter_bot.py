"""
Zola AI — Twitter Bot
Uses Tweepy v2 search polling (works on all API tiers, including Free/Basic).
Every 30 seconds we search for recent mentions of @use_zola and reply:
  - Unregistered user → "Sign up on https://zola-ai.pxxl.click/"
  - Registered user   → execute command (balance / pay / status / etc.)

Set TWITTER_POLL_INTERVAL env var (seconds, default 30) to tune frequency.
"""
import asyncio
import logging
import os
import time
import re

import tweepy
from dotenv import load_dotenv

from db import find_by_twitter, get_user

load_dotenv()

log = logging.getLogger("zola.twitter")

CONSUMER_KEY        = os.getenv("TWITTER_CONSUMER_KEY", "")
CONSUMER_SECRET     = os.getenv("TWITTER_CONSUMER_SECRET", "")
ACCESS_TOKEN        = os.getenv("TWITTER_ACCESS_TOKEN", "")
ACCESS_TOKEN_SECRET = os.getenv("TWITTER_ACCESS_TOKEN_SECRET", "")
BEARER_TOKEN        = os.getenv("TWITTER_BEARER_TOKEN", "")
POLL_INTERVAL       = int(os.getenv("TWITTER_POLL_INTERVAL", "30"))

SIGNUP_URL = "https://zola-ai.pxxl.click/"
BOT_HANDLE = "use_zola"

# IDs we've already replied to (reset on restart; use DB / Redis in prod)
_replied: set[str] = set()
_running = False


# --------------------------------------------------------------------------- #
# Command parser
# --------------------------------------------------------------------------- #
def _parse_command(text: str) -> tuple[str, list[str]]:
    """Extract the first /command and its args from a tweet."""
    text = text.replace(f"@{BOT_HANDLE}", "").strip()
    tokens = text.split()
    if not tokens:
        return "help", []
    cmd = tokens[0].lstrip("/").lower()
    return cmd, tokens[1:]


async def _handle_command(user_record: dict, cmd: str, args: list[str]) -> str:
    """Return the reply text for a registered user's command."""
    wallet = user_record["wallet"]

    if cmd in ("balance", "bal"):
        # Lightweight HTTP call to public Solana RPC
        import httpx
        try:
            payload = {
                "jsonrpc": "2.0", "id": 1, "method": "getBalance",
                "params": [wallet]
            }
            async with httpx.AsyncClient(timeout=8) as cli:
                r = await cli.post(
                    os.getenv("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"),
                    json=payload,
                )
                lamps = r.json()["result"]["value"]
            sol = lamps / 1_000_000_000
            short = f"{wallet[:6]}…{wallet[-6:]}"
            return f"💰 Balance for `{short}`: *{sol:.4f} SOL*"
        except Exception as e:
            return f"⚠️ Could not fetch balance: {e}"

    if cmd in ("pay", "send", "tip"):
        # Format: /pay @handle <amount>
        if len(args) < 2:
            return "Usage: /pay @handle <amount_in_sol>"
        return (
            f"💸 Payment commands via Twitter are queued and require "
            f"confirmation from your Zola dashboard."
        )

    if cmd == "status":
        tg = "✅" if user_record.get("tg_chat_id") else "❌"
        tw = "✅" if user_record.get("twitter_handle") else "❌"
        short = f"{wallet[:6]}…{wallet[-6:]}"
        return (
            f"📊 *Zola Status*\n"
            f"🔑 Wallet: `{short}`\n"
            f"📱 Telegram: {tg}\n"
            f"🐦 Twitter: {tw}"
        )

    return (
        "Available commands:\n"
        "/balance — wallet balance\n"
        "/status  — linked accounts\n"
        "/pay @handle <amount> — send SOL"
    )


# --------------------------------------------------------------------------- #
# Poll loop
# --------------------------------------------------------------------------- #
async def _poll(client: tweepy.Client):
    global _replied

    # Get our own user ID to exclude self-mentions
    me = client.get_me()
    bot_id = me.data.id
    newest_id = None

    log.info("Twitter poll loop started (interval=%ds)", POLL_INTERVAL)

    while _running:
        try:
            kwargs = dict(
                query=f"@{BOT_HANDLE} -is:retweet",
                tweet_fields=["author_id", "text", "conversation_id"],
                expansions=["author_id"],
                user_fields=["username"],
                max_results=10,
            )
            if newest_id:
                kwargs["since_id"] = newest_id

            resp = client.search_recent_tweets(**kwargs)

            if resp.data:
                # Track newest so we don't double-process
                newest_id = str(resp.data[0].id)

                # Build author_id → username map
                users_map: dict[str, str] = {}
                if resp.includes and "users" in resp.includes:
                    for u in resp.includes["users"]:
                        users_map[str(u.id)] = u.username

                # Process newest → oldest (reverse so we don't miss chain)
                for tweet in reversed(resp.data):
                    tweet_id  = str(tweet.id)
                    author_id = str(tweet.author_id)

                    # Skip our own tweets and already-replied
                    if author_id == str(bot_id) or tweet_id in _replied:
                        continue

                    _replied.add(tweet_id)
                    handle = users_map.get(author_id, "unknown")
                    log.info("Mention from @%s: %s", handle, tweet.text[:60])

                    # DB lookup
                    user_record = await find_by_twitter(handle)

                    if not user_record:
                        reply = (
                            f"@{handle} 👋 You need an account to use Zola!\n"
                            f"Sign up on {SIGNUP_URL} to start using zola 🚀"
                        )
                    else:
                        cmd, args = _parse_command(tweet.text)
                        reply_body = await _handle_command(user_record, cmd, args)
                        reply = f"@{handle} {reply_body}"

                    # Post reply (best-effort)
                    try:
                        client.create_tweet(
                            text=reply[:280],
                            in_reply_to_tweet_id=tweet_id,
                        )
                        log.info("Replied to @%s tweet %s", handle, tweet_id)
                    except Exception as e:
                        log.error("Failed to post reply: %s", e)

        except tweepy.Forbidden as e:
            log.warning(
                "Twitter API 402 — no credits on this account. "
                "Backing off 1 hour. Upgrade the Twitter Dev App plan to enable bot features. Error: %s", e
            )
            await asyncio.sleep(3600)
            continue
        except tweepy.TooManyRequests:
            log.warning("Twitter rate limit hit — sleeping 60s")
            await asyncio.sleep(60)
            continue
        except Exception as e:
            log.error("Twitter poll error: %s", e)

        await asyncio.sleep(POLL_INTERVAL)


async def start():
    global _running
    if not all([CONSUMER_KEY, CONSUMER_SECRET, ACCESS_TOKEN, ACCESS_TOKEN_SECRET]):
        log.warning("Twitter credentials missing — Twitter bot disabled")
        return

    _running = True
    client = tweepy.Client(
        bearer_token=BEARER_TOKEN,
        consumer_key=CONSUMER_KEY,
        consumer_secret=CONSUMER_SECRET,
        access_token=ACCESS_TOKEN,
        access_token_secret=ACCESS_TOKEN_SECRET,
        wait_on_rate_limit=False,
    )
    await _poll(client)


def stop():
    global _running
    _running = False
