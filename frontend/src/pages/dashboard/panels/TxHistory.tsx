import { useState, useContext, useEffect, useCallback } from "react";
import { WalletContext } from "@/components/WalletContext";
import { IC, FONT, ACCENT } from "../icons";
import { api } from "../../../lib/api";

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface TxRow {
  sig:    string;
  time:   string;
  type:   string;
  amount: string;
  status: "success" | "fail";
}

export function TxHistory() {
  const ctx       = useContext(WalletContext);
  const publicKey = ctx?.publicKey ?? null;
  const cluster   = ctx?.cluster   ?? "mainnet-beta";

  const [rows,    setRows]    = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const fetchTxs = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await api<{ transactions: Array<{ sig: string; blockTime: number; type: string; amount: string; err: any }> }>(
        `/api/wallet/${publicKey}/transactions?limit=10&cluster=${cluster}`
      );

      const result: TxRow[] = (data.transactions || []).map(t => ({
        sig:    t.sig,
        time:   t.blockTime ? timeAgo(t.blockTime) : "—",
        type:   t.type,
        amount: t.amount,
        status: t.err ? "fail" : "success",
      }));
      setRows(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [publicKey, cluster]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  const shortSig = (sig: string) => `${sig.slice(0, 6)}…${sig.slice(-6)}`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Transaction History</div>
        <button onClick={fetchTxs} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 11, fontFamily: FONT }}>Refresh</button>
      </div>

      {loading && rows.length === 0 && (
        <div style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "32px 0" }}>Loading…</div>
      )}

      {error && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", fontSize: 12, marginBottom: 12 }}>{error}</div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "32px 0" }}>No transactions found.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((row, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 14px", borderRadius: 12,
            background: "rgba(255,255,255,0.025)",
            border: `1px solid ${row.status === "fail" ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)"}`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: row.status === "fail" ? "rgba(248,113,113,0.1)" : row.type === "Received" ? "rgba(74,222,128,0.1)" : "rgba(125,113,211,0.1)",
              color: row.status === "fail" ? "#f87171" : row.type === "Received" ? "#4ade80" : ACCENT,
            }}>
              {row.status === "fail" ? IC.warning : row.type === "Received" ? IC.receive : IC.send}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#ccc", marginBottom: 2 }}>{row.type}</div>
              <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortSig(row.sig)}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: row.amount.startsWith("+") ? "#4ade80" : row.amount.startsWith("-") ? "#f87171" : "#888", marginBottom: 2 }}>{row.amount}</div>
              <div style={{ fontSize: 10, color: "#444" }}>{row.time}</div>
            </div>
            <a href={`https://solscan.io/tx/${row.sig}${cluster === "devnet" ? "?cluster=devnet" : ""}`} target="_blank" rel="noreferrer" style={{ color: "#444", display: "flex", flexShrink: 0 }}>
              {IC.link}
            </a>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <a href={`https://solscan.io/account/${publicKey}${cluster === "devnet" ? "?cluster=devnet" : ""}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: ACCENT, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {IC.link} View all on Solscan
          </a>
        </div>
      )}
    </div>
  );
}
