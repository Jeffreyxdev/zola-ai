# Zola AI — Backend

FastAPI server powering the Zola AI wallet agent. Handles user registration, real-time Solana monitoring, Telegram alerts, and Twitter bot gating.

---

## Stack

| Layer       | Technology                                        |
| ----------- | ------------------------------------------------- |
| Web server  | FastAPI + uvicorn                                 |
| Database    | SQLite via `aiosqlite` (drop-in PostgreSQL ready) |
| Blockchain  | Solana JSON-RPC + WebSocket (`logsSubscribe`)     |
| Telegram    | `python-telegram-bot` v21                         |
| Twitter     | `tweepy` v4 (v2 API, search polling)              |
| HTTP client | `httpx` (async)                                   |

---

## Modules

```
backend/
├── main.py            # FastAPI app — REST endpoints + WebSocket hub
├── db.py              # SQLite CRUD (users table)
├── solana_monitor.py  # Per-wallet Solana WS stream (cluster-aware)
├── telegram_bot.py    # /link flow + alert sender
├── twitter_bot.py     # Mention poller with user gating
├── requirements.txt
└── .env               # 🔐 NEVER commit this
```

### `main.py`

Entry point. Starts Telegram and Twitter bots as asyncio background tasks on startup. Exposes all REST endpoints and the WebSocket channel. Uses FastAPI's lifespan context for clean startup/shutdown.

### `db.py`

Async SQLite wrapper. Schema:

```sql
CREATE TABLE users (
    wallet          TEXT PRIMARY KEY,
    tg_chat_id      TEXT,
    tg_link_code    TEXT,
    twitter_handle  TEXT,
    cluster         TEXT DEFAULT 'mainnet-beta',
    created_at      TEXT DEFAULT (datetime('now'))
);
```

Auto-migrates the `cluster` column via `ALTER TABLE` on startup (safe to run against existing DBs).

### `solana_monitor.py`

Maintains a `wallet → asyncio.Queue` registry. For each connected wallet it opens a persistent `logsSubscribe` WebSocket to the Solana RPC. On every transaction it:

1. Pushes a structured JSON event to the frontend queue
2. Fires a Telegram alert if the wallet has a linked chat ID

Cluster-aware: call `update_cluster(wallet, "devnet")` to restart the stream on a different network hot, without dropping the frontend WS.

### `telegram_bot.py`

Runs in polling mode. Commands:

- `/start` — welcome + instructions
- `/link <code>` — pairs the Telegram chat with a wallet using a frontend-generated 6-char code

Exposes `send_alert(chat_id, text)` used by `solana_monitor`.

### `twitter_bot.py`

Polls `@use_zola` mentions every N seconds (configurable). For each unprocessed mention:

- **Unregistered user** → replies with signup link
- **Registered user** → parses `/balance`, `/status`, `/pay` commands and replies

Uses Tweepy v2 `search_recent_tweets` — works on all API tiers including Free.

---

## REST API

| Method | Path                     | Body                         | Description                 |
| ------ | ------------------------ | ---------------------------- | --------------------------- |
| `GET`  | `/`                      | —                            | Health check                |
| `POST` | `/api/link-wallet`       | `{wallet, cluster}`          | Register wallet in DB       |
| `PUT`  | `/api/cluster`           | `{wallet, cluster}`          | Live cluster switch         |
| `POST` | `/api/link-telegram`     | `{wallet}`                   | Generate one-time link code |
| `POST` | `/api/link-twitter`      | `{wallet, twitter_handle}`   | Store Twitter handle        |
| `GET`  | `/api/status/{wallet}`   | —                            | Linked accounts + cluster   |
| `GET`  | `/api/activity/{wallet}` | `?limit=8&cluster=devnet`    | Recent Solana TXes          |
| `POST` | `/api/bot/command`       | `{wallet, command, cluster}` | Execute terminal command    |
| `WS`   | `/ws/{wallet}`           | `?cluster=mainnet-beta`      | Real-time TX event stream   |

### WebSocket events (server → client)

```jsonc
// On connect
{ "type": "connected", "wallet": "...", "message": "👋 Zola AI monitoring..." }

// On transaction
{ "type": "tx", "wallet": "...", "cluster": "mainnet-beta", "signature": "...",
  "status": "success|failed", "error": null, "explorer": "https://solscan.io/..." }

// Cluster switched (after PUT /api/cluster)
{ "type": "cluster_changed", "cluster": "devnet", "message": "🔄 Switched to devnet" }

// Heartbeat (every 20s idle)
{ "type": "ping" }
```

### Bot commands (`/api/bot/command`)

| Command    | Response                                         |
| ---------- | ------------------------------------------------ |
| `/help`    | Lists all commands                               |
| `/balance` | Live SOL balance from Solana RPC (shows network) |
| `/history` | Last 5 transactions with status and timestamp    |
| `/status`  | Telegram + Twitter link status, wallet address   |
| `/alerts`  | Notification settings summary                    |

---

## Environment Variables

Copy `.env.example` → `.env` and fill in your keys.

```bash
# --- SOLANA ---
RPC_URL=https://api.mainnet-beta.solana.com
WS_URL=wss://api.mainnet-beta.solana.com
RPC_URL_DEV=https://api.devnet.solana.com
WS_URL_DEV=wss://api.devnet.solana.com

# --- DATABASE ---
DB_PATH=./zola.db

# --- SERVER ---
BACKEND_URL=http://localhost:8000

# --- TELEGRAM ---
TELEGRAM_TOKEN=<from @BotFather>
CHAT_ID=<your personal chat ID for testing>

# --- TWITTER (X) ---
TWITTER_CONSUMER_KEY=
TWITTER_CONSUMER_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_TOKEN_SECRET=
TWITTER_BEARER_TOKEN=
TWITTER_POLL_INTERVAL=30     # seconds between mention checks
```

> [!CAUTION]
> Never commit `.env`. It contains signing keys and bot tokens that give full wallet + account access. Add it to `.gitignore`.

---

## Setup & Running

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the server (dev with hot-reload)
uvicorn main:app --reload --port 8000

# 3. Start the server (production)
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```


Interactive API docs available at: `http://localhost:8000/docs`

---

## Telegram Link Flow

1. Frontend calls `POST /api/link-telegram` → backend generates code e.g. `A3F9C2`
2. User opens Telegram → messages `@Zolaactive_bot` → sends `/link A3F9C2`
3. Bot looks up code in DB, stores `tg_chat_id`, clears code
4. Bot replies: `✅ Linked! You'll receive alerts for wallet Ab12…`
5. Frontend polls `GET /api/status/{wallet}` every 3s and updates UI

---

## Twitter Gating Flow

1. User connects Twitter: `POST /api/link-twitter { wallet, twitter_handle }`
2. Bot polls `@use_zola` mentions every 30s
3. For each mention, looks up sender handle in DB:
   - **Found** → parse and execute command, reply with result
   - **Not found** → reply with signup URL

---

## Cluster Switching

The frontend exposes a devnet/mainnet toggle. When switched:

1. `SolanaWalletProvider` fires `PUT /api/cluster { wallet, cluster }`
2. Backend: `db.upsert_user(cluster=...)` + `solana_monitor.update_cluster(wallet, cluster)`
3. Monitor cancels existing `logsSubscribe` task and restarts on new WS URL
4. Frontend WS receives `{ type: "cluster_changed" }` event
5. All subsequent `/balance`, `/history`, and activity calls use the new cluster

---

## Production Notes

- **Database**: Swap SQLite for PostgreSQL by changing `DB_PATH` to a `postgresql+asyncpg://...` DSN and updating `aiosqlite` → `asyncpg` in `db.py`
- **CORS**: Change `allow_origins=["*"]` in `main.py` to your actual frontend domain
- **WebSockets at scale**: Replace `asyncio.Queue` with Redis pub/sub (`redis.asyncio`) for multi-instance deployments
- **Twitter rate limits**: Free tier allows ~500k tweets read/month. If hitting limits, increase `TWITTER_POLL_INTERVAL`

---

<div align="center">

Built by **Synq Studio** — Jeffrey Agabaenwere & Samuel Opeyemi

</div>

