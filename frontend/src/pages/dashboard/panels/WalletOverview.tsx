import { useState, useContext, useEffect, useCallback } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { WalletContext } from "@/components/WalletContext";
import { IC, FONT, ACCENT } from "../icons";
import { getSolanaRpcUrl } from "@/lib/api";

const COINGECKO_IDS: Record<string, string> = {
  SOL:  "solana",
  USDC: "usd-coin",
  JTO:  "jito-governance-token",
  BONK: "bonk",
};

const TOKEN_MINTS: Record<string, string> = {
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  JTO:  "jtojtomepa8beP8AuQc6eRk4YMA2PMA8MA6aP8MA6mA",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
};


const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const PLACEHOLDER_LOGO =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMTUiIGN5PSIxNSIgcj0iMTUiIGZpbGw9IiNkZGQiIC8+PC9zdmc+";

const RPC_FALLBACKS: string[] =
  ((import.meta.env.VITE_RPC_URL_FALLBACKS as string) || "").split(",").filter(u => !!u);

const KNOWN_TOKENS = [
  { symbol: "USDC", name: "USD Coin", logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
  { symbol: "JTO",  name: "Jito",     logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/jtojtomepa8beP8AuQc6eRk4YMA2PMA8MA6aP8MA6mA/logo.png" },
  { symbol: "BONK", name: "Bonk",     logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png" },
];

// ── Token Price Modal ──────────────────────────────────────────────────────
interface PriceData { usd: number; usd_24h_change: number }

function TokenModal({ symbol, name, balance, onClose }: {
  symbol: string;
  name: string;
  balance: number | null;
  onClose: () => void;
}) {
  const [price,   setPrice]   = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const cgId = COINGECKO_IDS[symbol];

  useEffect(() => {
    if (!cgId) { setLoading(false); return; }
    fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd&include_24hr_change=true`)
      .then(r => r.json())
      .then(d => setPrice(d[cgId] ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cgId]);

  const change  = price?.usd_24h_change ?? 0;
  const pos     = change >= 0;
  const usdVal  = price && balance !== null ? (balance * price.usd).toFixed(2) : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#0e0e0e", border: "1px solid rgba(125,113,211,0.25)", borderRadius: 18, width: "100%", maxWidth: 320, padding: "28px 24px", position: "relative", fontFamily: FONT }}>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", color: "#555" }}>{IC.close}</button>
        <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>{symbol}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#888", marginBottom: 20 }}>{name}</div>

        {/* Balance row */}
        {balance !== null && (
          <div style={{ background: "rgba(125,113,211,0.06)", border: "1px solid rgba(125,113,211,0.15)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#555" }}>Your balance</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#ddd", fontFamily: "monospace" }}>
              {balance < 0.0001 ? balance.toFixed(8) : balance.toLocaleString()} {symbol}
            </span>
          </div>
        )}

        {loading ? (
          <div style={{ fontSize: 13, color: "#444", textAlign: "center", padding: "16px 0" }}>Fetching price…</div>
        ) : !price ? (
          <div style={{ fontSize: 13, color: "#444", textAlign: "center", padding: "16px 0" }}>Price unavailable</div>
        ) : (
          <>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: -1, marginBottom: 6 }}>
              ${price.usd < 0.01 ? price.usd.toFixed(8) : price.usd.toFixed(2)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: pos ? "#4ade80" : "#f87171" }}>
                {pos ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
              </span>
              <span style={{ fontSize: 11, color: "#444" }}>24h</span>
              {usdVal && <span style={{ fontSize: 12, color: "#666", marginLeft: "auto" }}>≈ ${usdVal} USD</span>}
            </div>
            <div style={{ background: pos ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)", border: `1px solid ${pos ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: pos ? "#4ade80" : "#f87171", textAlign: "center" }}>
              {pos ? "📈" : "📉"} {Math.abs(change).toFixed(2)}% in the last 24 hours
            </div>
          </>
        )}
        <a href={`https://www.coingecko.com/en/coins/${cgId}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, fontSize: 11, color: "#555", textDecoration: "none" }}>
          {IC.link} View on CoinGecko
        </a>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export function WalletOverview({ onSend, onReceive }: { onSend: () => void; onReceive: () => void }) {
  const ctx       = useContext(WalletContext);
  const publicKey = ctx?.publicKey ?? null;
  const cluster   = ctx?.cluster   ?? "mainnet-beta";
  const shortKey  = publicKey ? `${publicKey.slice(0, 6)}…${publicKey.slice(-6)}` : "—";

  const [solBalance,    setSolBalance]    = useState<number | null>(null);
  const [tokenBalances, setTokenBalances] = useState<Record<string, number>>({});
  const [prices,        setPrices]        = useState<Record<string, number>>({});
  const [selectedToken, setSelectedToken] = useState<{ symbol: string; name: string } | null>(null);

  // ── get connection with fallback ──
  const getConnection = useCallback((): Connection => {
    const url = getSolanaRpcUrl(cluster);
    return new Connection(url, "confirmed");
  }, [cluster]);

  // ── fetch SOL balance ──
  const fetchSolBalance = useCallback(async () => {
    if (!publicKey) return;
    const urls = [getSolanaRpcUrl(cluster), ...RPC_FALLBACKS];
    for (const url of urls) {
      try {
        const conn  = new Connection(url, "confirmed");
        const lamps = await conn.getBalance(new PublicKey(publicKey));
        setSolBalance(lamps / LAMPORTS_PER_SOL);
        return;
      } catch (err) {
        console.warn("balance fetch failed on", url, err);
      }
    }
  }, [publicKey, cluster]);

  // ── fetch SPL token balances via Helius DAS ──
  const fetchTokenBalances = useCallback(async () => {
    if (!publicKey) return;
    try {
      const conn     = getConnection();
      const pubkey   = new PublicKey(publicKey);
      const accounts = await conn.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID });

      const balances: Record<string, number> = {};
      for (const { account } of accounts.value) {
        const info   = account.data.parsed?.info;
        const mint   = info?.mint as string;
        const amount = info?.tokenAmount;
        if (!mint || !amount) continue;

        // match against known mints
        for (const [symbol, knownMint] of Object.entries(TOKEN_MINTS)) {
          if (mint === knownMint) {
            balances[symbol] = Number(amount.uiAmount ?? 0);
          }
        }
      }
      setTokenBalances(balances);
    } catch (err) {
      console.warn("SPL token fetch failed", err);
    }
  }, [publicKey, getConnection]);

  // ── fetch all prices at once from CoinGecko ──
  const fetchPrices = useCallback(async () => {
    try {
      const ids  = Object.values(COINGECKO_IDS).join(",");
      const res  = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
      const data = await res.json();
      const map: Record<string, number> = {};
      for (const [symbol, cgId] of Object.entries(COINGECKO_IDS)) {
        if (data[cgId]?.usd) map[symbol] = data[cgId].usd;
      }
      setPrices(map);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await Promise.all([fetchSolBalance(), fetchTokenBalances(), fetchPrices()]);
    };
    run();
    const balanceInterval = setInterval(() => { fetchSolBalance(); fetchTokenBalances(); }, 30_000);
    const priceInterval   = setInterval(fetchPrices, 60_000);
    return () => { cancelled = true; clearInterval(balanceInterval); clearInterval(priceInterval); };
  }, [fetchSolBalance, fetchTokenBalances, fetchPrices]);

  const getUsdValue = (symbol: string, amount: number | null) => {
    if (amount === null || !prices[symbol]) return null;
    return (amount * prices[symbol]).toFixed(2);
  };

  const solUsd = getUsdValue("SOL", solBalance);

  // total portfolio USD
  const totalUsd = (() => {
    let total = 0;
    if (solBalance !== null && prices["SOL"]) total += solBalance * prices["SOL"];
    for (const [symbol, bal] of Object.entries(tokenBalances)) {
      if (prices[symbol]) total += bal * prices[symbol];
    }
    return total > 0 ? total.toFixed(2) : null;
  })();

  return (
    <div>
      {/* Balance card */}
      <div style={{ background: "rgba(125,113,211,0.06)", border: "1px solid rgba(125,113,211,0.2)", borderRadius: 14, padding: "20px 22px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 150, height: 150, borderRadius: "50%", background: "rgba(125,113,211,0.08)", filter: "blur(40px)", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, color: "#555", fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Total Balance</div>
        {totalUsd ? (
          <>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>
              ${totalUsd}
              <span style={{ fontSize: 14, color: "#555", fontWeight: 500, marginLeft: 8 }}>USD</span>
            </div>
            {solBalance !== null && (
              <div style={{ fontSize: 14, color: "#888", marginTop: 3 }}>
                {solBalance.toFixed(4)} SOL
              </div>
            )}
          </>
        ) : solBalance === null ? (
          <div style={{ fontSize: 28, fontWeight: 800, color: "#333", letterSpacing: -1 }}>—</div>
        ) : (
          <>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: -1 }}>
              {solBalance.toFixed(4)}
              <span style={{ fontSize: 14, color: "#555", fontWeight: 500, marginLeft: 8 }}>SOL</span>
            </div>
            {solUsd && <div style={{ fontSize: 14, color: "#888", marginTop: 3 }}>${solUsd} USD</div>}
          </>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <span style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>{shortKey}</span>
          {cluster === "devnet" && (
            <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 6, padding: "2px 8px", letterSpacing: 1 }}>DEVNET</span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[
          { label: "Send",    icon: IC.send,    action: onSend    },
          { label: "Receive", icon: IC.receive, action: onReceive },
        ].map(btn => (
          <button key={btn.label} onClick={btn.action} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)", color: "#888", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,113,211,0.1)"; e.currentTarget.style.color = ACCENT; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "#888"; }}
          >
            {btn.icon} {btn.label}
          </button>
        ))}
      </div>

      {/* Token list */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, color: "#444", textTransform: "uppercase", marginBottom: 8 }}>Assets</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>

        {/* SOL row */}
        <button onClick={() => setSelectedToken({ symbol: "SOL", name: "Solana" })}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", width: "100%", textAlign: "left", transition: "background 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(125,113,211,0.05)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
        >
          <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{IC.solana}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>SOL</div>
            <div style={{ fontSize: 11, color: "#444" }}>Solana</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#aaa", fontFamily: "monospace" }}>{solBalance !== null ? solBalance.toFixed(4) : "—"}</div>
            <div style={{ fontSize: 11, color: "#444" }}>{solUsd ? `$${solUsd}` : "—"}</div>
          </div>
          <div style={{ color: "#333", marginLeft: 4 }}>{IC.arrowRight}</div>
        </button>

        {KNOWN_TOKENS.map(t => {
          const bal    = tokenBalances[t.symbol] ?? null;
          const usdVal = getUsdValue(t.symbol, bal);
          return (
            <button key={t.symbol} onClick={() => setSelectedToken(t)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", cursor: "pointer", width: "100%", textAlign: "left", transition: "background 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(125,113,211,0.05)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            >
              <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, borderRadius: "50%", overflow: "hidden" }}>
                <img src={t.logo} alt={t.symbol} style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={e => { const img = e.currentTarget as HTMLImageElement; img.onerror = null; img.src = PLACEHOLDER_LOGO; }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>{t.symbol}</div>
                <div style={{ fontSize: 11, color: "#444" }}>{t.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: bal !== null ? "#aaa" : "#555", fontFamily: "monospace" }}>
                  {bal !== null ? (bal < 0.0001 ? bal.toFixed(8) : bal.toLocaleString()) : "—"}
                </div>
                <div style={{ fontSize: 11, color: "#444" }}>{usdVal ? `$${usdVal}` : "Tap for price"}</div>
              </div>
              <div style={{ color: "#333", marginLeft: 4 }}>{IC.arrowRight}</div>
            </button>
          );
        })}
      </div>

      {selectedToken && (
        <TokenModal
          symbol={selectedToken.symbol}
          name={selectedToken.name}
          balance={selectedToken.symbol === "SOL" ? solBalance : (tokenBalances[selectedToken.symbol] ?? null)}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  );
}