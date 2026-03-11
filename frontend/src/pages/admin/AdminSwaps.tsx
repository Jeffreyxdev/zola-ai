import { useState, useEffect } from "react";
import { adminApi } from "../../lib/api";

const FONT = "'Inter', 'SF Pro Display', sans-serif";
const ACCENT = "#7D71D3";

interface Swap {
  id: number; wallet: string; token_in: string; token_out: string;
  amount_in: number; fee_usd: number; tx_signature: string;
  cluster: string; created_at: string;
}

export default function AdminSwaps({ wallet }: { wallet: string }) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [loading, setLoad] = useState(true);

  useEffect(() => {
    adminApi<{ swaps: Swap[] }>("/admin/swaps?limit=100", wallet)
      .then(r => setSwaps(r.swaps ?? []))
      .catch(console.error)
      .finally(() => setLoad(false));
  }, [wallet]);

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Admin</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>Swaps</h1>
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Latest 100 swaps across all users</div>
      </div>

      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 80px 80px 1fr 90px", gap: 8, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>
          <span>Wallet</span><span>From</span><span>To</span><span>Amount</span><span>Fee USD</span><span>Tx</span><span>Date</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: "#555", fontSize: 13 }}>Loading swaps…</div>
        ) : swaps.length === 0 ? (
          <div style={{ padding: 24, color: "#555", fontSize: 13 }}>No swaps recorded yet.</div>
        ) : swaps.map(s => (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 80px 80px 1fr 90px", gap: 8, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", fontSize: 11 }}>
            <span style={{ color: "#555", fontFamily: "monospace", fontSize: 10 }}>{s.wallet?.slice(0, 8)}…</span>
            <span style={{ color: "#888" }}>{s.token_in}</span>
            <span style={{ color: "#888" }}>{s.token_out}</span>
            <span style={{ color: "#ccc" }}>{s.amount_in?.toFixed(4)}</span>
            <span style={{ color: s.fee_usd > 0 ? "#4ade80" : "#555" }}>${s.fee_usd?.toFixed(4)}</span>
            <a
              href={`https://explorer.solana.com/tx/${s.tx_signature}?cluster=${s.cluster}`}
              target="_blank" rel="noreferrer"
              style={{ color: ACCENT, fontFamily: "monospace", fontSize: 10, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
            >
              {s.tx_signature?.slice(0, 12)}…
            </a>
            <span style={{ color: "#444", fontSize: 10 }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
