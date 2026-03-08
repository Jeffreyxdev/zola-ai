# Zola AI — Frontend

This is the React + Vite frontend for Zola AI. It provides the dashboard where users can link their Phantom wallet, connect their Telegram/Twitter accounts, and view real-time WebSocket transaction feeds.

## Tech Stack
- React 18
- Vite
- Tailwind CSS
- Solana Wallet Adapter (`@solana/wallet-adapter-react`)
- Framer Motion

## Setup
```bash
npm install
npm run dev
```

Remember to copy `.env.example` to `.env.local` and set your `VITE_API_URL` and `VITE_WS_URL` to point to the FastAPI backend.

For the full backend and architecture documentation, see the [Main README](../README.md).
