import { useState, useContext, useEffect, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { WalletContext } from "../../../components/SolanaWalletProvider";
import { IC, FONT, ACCENT } from "../icons";

function getRpcUrl(cluster: string) {
  return cluster === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com";
}

function shortSig(sig: string) {
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface TxRow {
  sig:      string;
  time:     string;
  label:    string;
  status:   "success" | "fail";
  amount:   string | null;
}

export function ActivityFeed() {
  const ctx       = useContext(WalletContext);
  const publicKey = ctx?.publicKey ?? null;
  const cluster   = ctx?.cluster   ?? "mainnet-beta";

  const [rows,    setRows]    = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const fetchActivity = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError("");
    try {
      const conn = new Connection(getRpcUrl(cluster), "confirmed");
      const sigs = await conn.getSignaturesForAddress(
        new PublicKey(publicKey),
        { limit: 8 }
      );
      const result: TxRow[] = sigs.map(s => ({
        sig:    s.signature,
        time:   s.blockTime ? timeAgo(s.blockTime) : "—",
        label:  s.memo ?? "Transaction",
        status: s.err ? "fail" : "success",
        amount: null,
      }));
      setRows(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError("Could not load activity: " + msg);
    } finally {
      setLoading(false);
    }
  }, [publicKey, cluster]);

  useEffect(() => {
    fetchActivity();
    const id = setInterval(fetchActivity, 60_000);
    return () => clearInterval(id);
  }, [fetchActivity]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>On-chain Activity</div>
        <button onClick={fetchActivity} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 11, fontFamily: FONT }}>
          Refresh
        </button>
      </div>

      {loading && rows.length === 0 && (
        <div style={{ fontSize: 13, color: "#444", textAlign: "center", padding: "32px 0" }}>Fetching transactions…</div>
      )}

      {error && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", fontSize: 12, marginBottom: 12 }}>
          {IC.warning} {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ fontSize: 13, color: "#444", textAlign: "center", padding: "32px 0" }}>No transactions found.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((row, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "14px 16px", borderRadius: 12,
            background: row.status === "fail"
              ? "rgba(248,113,113,0.04)"
              : "rgba(255,255,255,0.025)",
            border: `1px solid ${row.status === "fail"
              ? "rgba(248,113,113,0.12)"
              : "rgba(255,255,255,0.05)"}`,
          }}>
            {/* Status dot */}
            <div style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 4, flexShrink: 0, background: row.status === "fail" ? "#f87171" : "#4ade80", boxShadow: row.status === "fail" ? "0 0 6px #f87171" : "0 0 6px #4ade80" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 3, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shortSig(row.sig)}
              </div>
              <div style={{ fontSize: 11, color: "#555" }}>{row.label}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "#444" }}>{row.time}</span>
              <a href={`https://solscan.io/tx/${row.sig}${cluster === "devnet" ? "?cluster=devnet" : ""}`} target="_blank" rel="noreferrer" style={{ color: "#555", display: "flex" }} title="View on Solscan">
                {IC.link}
              </a>
            </div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 12, textAlign: "center" }}>
          <a href={`https://solscan.io/account/${publicKey}${cluster === "devnet" ? "?cluster=devnet" : ""}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: ACCENT, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {IC.link} View all on Solscan
          </a>
        </div>
      )}
    </div>
  );
}
