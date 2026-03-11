import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { adminApi, adminPost } from "../../lib/api";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

interface User {
  wallet: string; plan: string; tg_linked: number; tw_linked: number;
  cluster: string; created_at: string; expires_at: string | null;
  last_swap: string | null; total_volume: number;
}

export default function AdminUsers({ wallet }: { wallet: string }) {
  const [page,    setPage]    = useState(1);
  const [plan,    setPlan]    = useState("");
  const [search,  setSearch]  = useState("");
  const [data,    setData]    = useState<{ total: number; users: User[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState<string | null>(null);

  const fetchUsers = useCallback(() => {
    const planStr = plan ? `&plan=${plan}` : "";
    // setLoading is only set inside async callbacks, never synchronously in the effect
    Promise.resolve()
      .then(() => { setLoading(true); })
      .then(() => adminApi<{ total: number; users: User[] }>(`/admin/users?page=${page}&limit=50${planStr}`, wallet))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, [wallet, page, plan]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const upgrade = async (w: string) => {
    setActing(w);
    await adminPost("/admin/users/" + encodeURIComponent(w) + "/upgrade", wallet, { plan: "pro", days: 30 });
    fetchUsers();
    setActing(null);
  };

  const downgrade = async (w: string) => {
    setActing(w);
    await adminPost("/admin/users/" + encodeURIComponent(w) + "/downgrade", wallet, {});
    fetchUsers();
    setActing(null);
  };

  const filtered = data?.users.filter(u =>
    !search || u.wallet.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Admin</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>Users</h1>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          id="user-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by wallet…"
          style={{ flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "#0e0e10", color: "#fff", fontSize: 12, fontFamily: FONT, outline: "none" }}
        />
        <select
          id="plan-filter"
          value={plan}
          onChange={e => { setPlan(e.target.value); setPage(1); }}
          style={{ padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", background: "#0e0e10", color: "#888", fontSize: 12, fontFamily: FONT, outline: "none", cursor: "pointer" }}
        >
          <option value="">All plans</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
        <div style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center" }}>{data?.total ?? "—"} total</div>
      </div>

      {/* Table */}
      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 60px 60px 90px 1fr 100px", gap: 8, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>
          <span>Wallet</span><span>Plan</span><span>TG</span><span>TW</span><span>Volume</span><span>Joined</span><span>Actions</span>
        </div>

        {loading ? (
          <div style={{ padding: 24, color: "#555", fontSize: 13 }}>Loading users…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, color: "#555", fontSize: 13 }}>No users found.</div>
        ) : filtered.map(u => (
          <div key={u.wallet} style={{ display: "grid", gridTemplateColumns: "2fr 70px 60px 60px 90px 1fr 100px", gap: 8, padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center", transition: "background 0.1s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <Link to={`/admin/users/${u.wallet}`} style={{ color: "#aaa", fontSize: 11, fontFamily: "monospace", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.wallet.slice(0, 8)}…{u.wallet.slice(-6)}
            </Link>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
              background: u.plan === "pro" ? "rgba(125,113,211,0.15)" : "rgba(255,255,255,0.05)",
              color: u.plan === "pro" ? ACCENT : "#555", textTransform: "uppercase",
            }}>{u.plan}</span>
            <span style={{ fontSize: 12, color: u.tg_linked ? "#4ade80" : "#333" }}>{u.tg_linked ? "✓" : "—"}</span>
            <span style={{ fontSize: 12, color: u.tw_linked ? "#4ade80" : "#333" }}>{u.tw_linked ? "✓" : "—"}</span>
            <span style={{ fontSize: 11, color: "#888" }}>${u.total_volume.toFixed(2)}</span>
            <span style={{ fontSize: 10, color: "#444" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {u.plan !== "pro" ? (
                <button
                  id={`upgrade-${u.wallet.slice(0, 8)}`}
                  onClick={() => upgrade(u.wallet)}
                  disabled={acting === u.wallet}
                  style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${ACCENT}`, background: "rgba(125,113,211,0.1)", color: ACCENT, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: FONT, opacity: acting === u.wallet ? 0.5 : 1 }}
                >Pro</button>
              ) : (
                <button
                  id={`downgrade-${u.wallet.slice(0, 8)}`}
                  onClick={() => downgrade(u.wallet)}
                  disabled={acting === u.wallet}
                  style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#f87171", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
                >↓ Free</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data && data.total > 50 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#555", fontSize: 12, cursor: "pointer" }}
          >← Prev</button>
          <span style={{ color: "#555", fontSize: 12, display: "flex", alignItems: "center" }}>Page {page}</span>
          <button
            onClick={() => setPage(p => p + 1)} disabled={page * 50 >= data.total}
            style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#555", fontSize: 12, cursor: "pointer" }}
          >Next →</button>
        </div>
      )}
    </div>
  );
}
