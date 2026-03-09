<div align="center">

# 🤖 Zola AI

### Autonomous DeFi Bot Agent — Solana × Twitter × Telegram

[![Solana](https://img.shields.io/badge/Solana-Mainnet-9945FF?logo=solana&logoColor=white)](https://solana.com)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React+Vite-61DAFB?logo=react&logoColor=white)](https://vitejs.dev)
[![Twitter](https://img.shields.io/badge/Bot-Twitter%20%2F%20X-000000?logo=x&logoColor=white)](https://twitter.com/use_zola)

**Trade, DCA, and execute instantly on Twitter — fueled by liquidity, built on Solana.**

[Live App](https://zola-ai.pxxl.click) · [Twitter / X](https://x.com/use_zola)

[Live App](https://zola-ai.pxxl.click) · [Twitter / X](https://x.com/use_zola)

</div>

---

> **🏆 HACKATHON JUDGES NOTE**
> We focused our primary testing and user flow on the **Telegram Bot** for this hackathon. The **Twitter bot** is fully functional in code (sharing the exact same Gemini agent execution pipeline), but due to pending Twitter API credits, we were unable to test it live. Please use the Telegram integration to test the full agentic flow! See `SKILL.MD` for a breakdown of our technical achievements.

---

## What is Zola?

Zola is an **autonomous AI bot agent** that connects your Solana wallet to Twitter and Telegram, letting you execute DeFi strategies using natural language commands.

```
@use_zola trade 10 SOL → USDC
@use_zola set DCA $100 weekly on SOL
@use_zola /balance
```

When you tweet a command `@use_zola`, Zola:

1. Verifies your Twitter handle is registered
2. Reads your linked Solana wallet
3. Executes the strategy on-chain
4. Replies with the result

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        FRONTEND                         │
│   React + Vite  (Solana Wallet Adapter)                 │
│   SolanaWalletProvider → POST /api/link-wallet          │
│   BotTerminal   → WS /ws/{wallet}                       │
│   ConnectedAccounts → POST /api/link-telegram+twitter   │
│   ActivityFeed  → WS /ws/{wallet}  (live push)          │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTP + WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                     BACKEND (FastAPI)                    │
│   main.py  — REST API + WebSocket hub                   │
│   db.py    — SQLite user store (wallet/TG/Twitter)      │
│   solana_monitor.py — logsSubscribe per wallet          │
│   telegram_bot.py   — /link flow + TX alerts            │
│   twitter_bot.py    — mention polling + command gating  │
└───────┬──────────────────────┬──────────────────────────┘
        │                      │
┌───────▼──────┐    ┌──────────▼──────────┐
│  Solana RPC  │    │  Telegram / Twitter  │
│  (mainnet)   │    │       APIs           │
└──────────────┘    └─────────────────────┘
```

### Key Data Flows

| Event            | Flow                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| Wallet connect   | Frontend → `POST /api/link-wallet` → DB row created                     |
| TG link          | Frontend generates code → user sends `/link <code>` to bot → DB updated |
| Twitter link     | User enters `@handle` in dashboard → `POST /api/link-twitter` → DB      |
| TX detected      | Solana WS → `solana_monitor` → frontend WS push + TG alert              |
| Bot terminal cmd | Frontend → `POST /api/bot/command` → Solana RPC → response              |
| Twitter mention  | Tweepy polling → DB lookup → reply or signup prompt                     |

---

## Project Structure

```
zola/
├── backend/
│   ├── main.py            # FastAPI app (REST + WebSocket)
│   ├── db.py              # SQLite async user store
│   ├── solana_monitor.py  # Per-wallet Solana WS subscription
│   ├── telegram_bot.py    # Link flow + alert sender
│   ├── twitter_bot.py     # Mention poller with gating
│   ├── requirements.txt
│   └── .env               # Secrets (never commit!)
└── frontend/
    ├── src/
    │   ├── lib/api.ts     # Centralised API/WS helper
    │   ├── components/
    │   │   └── SolanaWalletProvider.tsx
    │   └── pages/dashboard/panels/
    │       ├── BotTerminal.tsx      # Live WS terminal
    │       ├── ConnectedAccounts.tsx # TG + Twitter link UI
    │       ├── ActivityFeed.tsx     # Real-time TX feed
    │       ├── WalletOverview.tsx
    │       ├── SendPanel.tsx
    │       └── ...
    └── .env.local         # VITE_API_URL / VITE_WS_URL
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Solana wallet (Phantom / Solflare / Backpack)
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Twitter Developer App (Basic or Elevated tier for mention reading)

### 1 — Backend

```bash
cd backend
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

Expected output:

```
INFO  zola.main:  Zola AI backend starting…
INFO  zola.main:  Zola AI backend ready
INFO  uvicorn:  Application startup complete.
```

### 2 — Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:5173`.

---

## Environment Variables

### Backend — `backend/.env`

| Variable                      | Description                    | Example                               |
| ----------------------------- | ------------------------------ | ------------------------------------- |
| `TELEGRAM_TOKEN`              | Bot token from @BotFather      | `8683:AAF...`                         |
| `RPC_URL`              | Solana JSON-RPC endpoint       | `https://api.mainnet-beta.solana.com` |
| `WS_URL`               | Solana WebSocket endpoint      | `wss://api.mainnet-beta.solana.com`   |
| `DB_PATH`                     | SQLite file path               | `./zola.db`                           |
| `TWITTER_CONSUMER_KEY`        | Twitter App consumer key       |                                       |
| `TWITTER_CONSUMER_SECRET`     | Twitter App consumer secret    |                                       |
| `TWITTER_ACCESS_TOKEN`        | Bot account access token       |                                       |
| `TWITTER_ACCESS_TOKEN_SECRET` | Bot account token secret       |                                       |
| `TWITTER_BEARER_TOKEN`        | For v2 search API              |                                       |
| `TWITTER_POLL_INTERVAL`       | Seconds between mention checks | `30`                                  |

### Frontend — `frontend/.env.local`

| Variable       | Description                | Default                 |
| -------------- | -------------------------- | ----------------------- |
| `VITE_API_URL` | Backend HTTP base URL      | `http://localhost:8000` |
| `VITE_WS_URL`  | Backend WebSocket base URL | `ws://localhost:8000`   |

---

## API Reference

| Method | Path                     | Description                     |
| ------ | ------------------------ | ------------------------------- |
| `POST` | `/api/link-wallet`       | Register wallet address in DB   |
| `POST` | `/api/link-telegram`     | Generate one-time TG link code  |
| `POST` | `/api/link-twitter`      | Store Twitter handle for gating |
| `GET`  | `/api/status/{wallet}`   | Return linked accounts status   |
| `GET`  | `/api/activity/{wallet}` | Recent Solana transactions      |
| `POST` | `/api/bot/command`       | Execute terminal command        |
| `WS`   | `/ws/{wallet}`           | Real-time TX event stream       |

---

## Bot Commands

### In-App Terminal & Telegram

| Command    | Description                           |
| ---------- | ------------------------------------- |
| `/balance` | Live SOL balance from Solana RPC      |
| `/history` | Last 5 signed transactions            |
| `/status`  | Linked accounts (TG, Twitter, Wallet) |
| `/alerts`  | Manage notification preferences       |
| `/help`    | List all commands                     |

### Twitter / X — @use_zola

| Tweet                        | Action                |
| ---------------------------- | --------------------- |
| `@use_zola /balance`         | SOL balance reply     |
| `@use_zola /status`          | Linked accounts reply |
| `@use_zola /pay @handle 1.5` | Queue payment         |
| _(unregistered user)_        | Signup prompt replied |

---

## Telegram Link Flow

1. Dashboard → **Accounts** → Click **Connect** next to Telegram
2. A 6-character one-time code is generated (e.g. `A3F9C2`)
3. Open Telegram → message **@zola_ai_bot**
4. Send: `/link A3F9C2`
5. Bot replies: `✅ Linked! You'll now receive alerts for wallet Ab12…Xy34`
6. Dashboard updates automatically (polls every 3 seconds)

---

## Twitter Gating

Zola bot polls `@use_zola` mentions every 30 seconds (configurable via `TWITTER_POLL_INTERVAL`).

- **Unregistered user**: Replies with signup link

  > "@username 👋 You need an account to use Zola! Sign up on https://zola-ai.pxxl.click/ to start using zola 🚀"

- **Registered user**: Processes command and replies with result

To register: Dashboard → **Accounts** → Connect **X (Twitter)** → enter your handle.

---

## Production Deployment (AWS)

### Recommended Stack

| Layer           | Service                               |
| --------------- | ------------------------------------- |
| Backend         | EC2 (t3.small) or ECS Fargate         |
| Database        | RDS PostgreSQL (swap SQLite for prod) |
| Frontend        | S3 + CloudFront                       |
| Process manager | systemd / supervisor or ECS task      |
| SSL             | ACM + ALB                             |

### Quick EC2 Deploy

```bash
# 1. Clone & install
git clone <repo> && cd zola/backend
pip install -r requirements.txt

# 2. Set env vars
cp .env .env.prod
# Edit .env.prod with production keys + RDS URL

# 3. Run with systemd (create /etc/systemd/system/zola.service)
[Unit]
Description=Zola AI Backend
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/zola/backend
EnvironmentFile=/home/ubuntu/zola/backend/.env.prod
ExecStart=uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always

[Install]
WantedBy=multi-user.target

# 4. Enable
sudo systemctl enable zola && sudo systemctl start zola
```

### WebSocket at Scale

The WebSocket `/ws/{wallet}` uses asyncio internally. For multi-instance deployments, add a Redis pub/sub layer so monitor events on any instance reach the right frontend WS. Replace `asyncio.Queue` with Redis streams and use `redis.asyncio` as the bridge.

### Frontend Build

```bash
cd frontend
VITE_API_URL=https://api.yourdomain.com \
VITE_WS_URL=wss://api.yourdomain.com \
npm run build
# Upload dist/ to S3
aws s3 sync dist/ s3://your-bucket --delete
```

---

## Security Notes

- **Never commit `.env`** — use AWS Secrets Manager or SSM Parameter Store in production
- CORS is currently set to `allow_origins=["*"]` — restrict to your domain before going live
- Twitter keys in `.env` have full write access — rotate them if accidentally exposed
- SQLite is single-file and process-local — upgrade to PostgreSQL before scaling horizontally

---

## Tech Stack

| Layer      | Technology                                             |
| ---------- | ------------------------------------------------------ |
| Blockchain | Solana (via `@solana/web3.js`, `solders`)              |
| Frontend   | React 18, Vite, TypeScript, Framer Motion              |
| Wallet     | Phantom, Solflare, Backpack, Magic Eden (via adapters) |
| Backend    | Python 3.11, FastAPI, uvicorn                          |
| Database   | SQLite / PostgreSQL (via `aiosqlite`)                  |
| Messaging  | Telegram Bot API (`python-telegram-bot`)               |
| Social     | Twitter v2 API (`tweepy`)                              |
| Real-time  | WebSocket (`websockets`, native browser WS)            |

---

<div align="center">

Built with ☕ and `ctrl+z` — [Zola AI](https://zola-ai.pxxl.click) · [@use_zola](https://x.com/use_zola)

**Built by Synq Studio** — Jeffrey Agabaenwere & Samuel Opeyemi

</div>
