import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { adminApi, adminPost } from "../../lib/api";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

export default function AdminUserDetail({ wallet }: { wallet: string }) {
  const { w } = useParams<{ w: string }>();
  const [data, setData]   = useState<{ user: Record<string, unknown>; subscription: Record<string, unknown> | null; recent_swaps: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing]   = useState(false);

  useEffect(() => {
    if (!w) return;
    adminApi<typeof data>(`/admin/users/${encodeURIComponent(w)}`, wallet)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [w, wallet]);

  const upgrade   = async () => { setActing(true); await adminPost(`/admin/users/${encodeURIComponent(w!)}/upgrade`, wallet, { plan: "pro", days: 30 }); setActing(false); window.location.reload(); };
  const downgrade = async () => { setActing(true); await adminPost(`/admin/users/${encodeURIComponent(w!)}/downgrade`, wallet, {}); setActing(false); window.location.reload(); };

  if (loading) return <div style={{ color: "#555", fontFamily: FONT, padding: 24 }}>Loading user profile…</div>;
  if (!data)   return <div style={{ color: "#f87171", fontFamily: FONT, padding: 24 }}>User not found.</div>;

  const { user, subscription: sub, recent_swaps } = data;
  const plan = (sub as Record<string, unknown>)?.plan ?? "free";

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 20 }}>
        <Link to="/admin/users" style={{ color: "#555", fontSize: 12, textDecoration: "none" }}>← Users</Link>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "8px 0 0", fontFamily: "monospace" }}>
          {w?.slice(0, 10)}…{w?.slice(-6)}
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* User Info */}
        <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>User Info</div>
          {[
            ["Wallet", w],
            ["Cluster", user.cluster as string ?? "mainnet-beta"],
            ["Joined", user.created_at ? new Date(user.created_at as string).toLocaleDateString() : "—"],
            ["Telegram", user.tg_chat_id ? "✓ Linked" : "—"],
            ["Twitter", user.twitter_handle ? `@${user.twitter_handle}` : "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
              <span style={{ color: "#555" }}>{k}</span>
              <span style={{ color: "#ccc", fontFamily: "monospace", fontSize: 11 }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Subscription */}
        <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Subscription</div>
          <div style={{
            display: "inline-block", fontSize: 14, fontWeight: 800, padding: "4px 14px",
            borderRadius: 20, marginBottom: 12,
            background: plan === "pro" ? "rgba(125,113,211,0.15)" : "rgba(255,255,255,0.05)",
            color: plan === "pro" ? ACCENT : "#555",
            textTransform: "uppercase",
          }}>{plan as string}</div>
          {[
            ["Started", sub ? new Date((sub.started_at ?? sub.created_at ?? "") as string).toLocaleDateString() : "—"],
            ["Expires", sub?.expires_at ? new Date(sub.expires_at as string).toLocaleDateString() : "—"],
            ["Auto-renew", sub ? (sub.auto_renew ? "Yes" : "No") : "—"],
            ["Token", sub?.payment_token as string ?? "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
              <span style={{ color: "#555" }}>{k}</span>
              <span style={{ color: "#ccc" }}>{v as string}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            {plan !== "pro" ? (
              <button id="detail-upgrade-btn" onClick={upgrade} disabled={acting} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${ACCENT}`, background: "rgba(125,113,211,0.1)", color: ACCENT, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Gift Pro (30d)</button>
            ) : (
              <button id="detail-downgrade-btn" onClick={downgrade} disabled={acting} style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid rgba(248,113,113,0.3)", background: "transparent", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>Downgrade to Free</button>
            )}
          </div>
        </div>
      </div>

      {/* Recent swaps */}
      {recent_swaps && recent_swaps.length > 0 && (
        <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Recent Swaps</div>
          {(recent_swaps as Record<string, unknown>[]).map((s, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: 12 }}>
              <span style={{ color: "#888" }}>{s.token_in as string} → {s.token_out as string}</span>
              <span style={{ color: "#555", fontFamily: "monospace", fontSize: 11 }}>{(s.tx_signature as string)?.slice(0, 10)}…</span>
              <span style={{ color: "#444" }}>{s.created_at ? new Date(s.created_at as string).toLocaleDateString() : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
