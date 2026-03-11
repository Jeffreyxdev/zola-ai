import { useState, useEffect } from "react";
import { adminApi } from "../../lib/api";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

export default function AdminSettings({ wallet }: { wallet: string }) {
  const [stats, setStats] = useState<Record<string, unknown>>({});

  useEffect(() => {
    adminApi<Record<string, unknown>>("/admin/stats", wallet).then(setStats).catch(() => {});
  }, [wallet]);

  const items = [
    { label: "Treasury Wallet", key: "treasury", value: import.meta.env.VITE_TREASURY_WALLET ?? "(set ZOLA_TREASURY_WALLET in .env)" },
    { label: "Pro Price",       key: "price",    value: "$6.00 / month" },
    { label: "Jupiter Fee",     key: "fee",      value: "0.3% (30 bps)" },
    { label: "USDC Mint",       key: "usdc",     value: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  ];

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Admin</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>Settings</h1>
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Configuration is managed via backend .env file</div>
      </div>

      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>Platform Config</div>
        {items.map(item => (
          <div key={item.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 12, color: "#666", minWidth: 160 }}>{item.label}</span>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "#aaa", textAlign: "right", maxWidth: 360, wordBreak: "break-all" }}>{item.value}</span>
          </div>
        ))}
      </div>

      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>Live Stats</div>
        {[
          ["Total Users",    String(stats.total_users ?? "—")],
          ["Pro Users",      String(stats.pro_users ?? "—")],
          ["Swaps (month)",  String(stats.swaps_this_month ?? "—")],
          ["Fee Revenue",    `$${Number(stats.total_fee_revenue_usd ?? 0).toFixed(4)}`],
          ["Sub Revenue",    `$${Number(stats.total_pro_revenue_usd ?? 0).toFixed(2)}`],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
            <span style={{ color: "#666" }}>{k}</span>
            <span style={{ color: "#fff", fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, padding: "14px 18px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10 }}>
        <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700, marginBottom: 4 }}>⚠️ To change settings</div>
        <div style={{ fontSize: 11, color: "#888", lineHeight: 1.6 }}>
          Update the backend <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>.env</code> file and redeploy to Fly.io.
          Treasury wallet, fee BPS, and pro price are all environment-controlled.
        </div>
      </div>
    </div>
  );
}
