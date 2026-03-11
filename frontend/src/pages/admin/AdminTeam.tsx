import { useState, useEffect } from "react";
import { adminApi, adminPost, adminDel } from "../../lib/api";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

interface TeamMember { wallet: string; role: string; name: string | null; added_at: string }

export default function AdminTeam({ wallet, adminRole }: { wallet: string; adminRole: string }) {
  const [team,    setTeam]    = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newW,    setNewW]    = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [newName, setNewName] = useState("");
  const [adding,  setAdding]  = useState(false);
  const [error,   setError]   = useState("");

  const isSuperAdmin = adminRole === "superadmin";

  const fetchTeam = () => {
    adminApi<{ team: TeamMember[] }>("/admin/team", wallet)
      .then(r => setTeam(r.team ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchTeam, [wallet]);

  const add = async () => {
    if (!newW.trim()) return;
    setAdding(true); setError("");
    try {
      await adminPost("/admin/team", wallet, { wallet: newW.trim(), role: newRole, name: newName || null });
      setNewW(""); setNewName("");
      fetchTeam();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setAdding(false); }
  };

  const remove = async (w: string) => {
    if (!confirm(`Remove ${w.slice(0, 10)}… from team?`)) return;
    await adminDel(`/admin/team/${encodeURIComponent(w)}`, wallet);
    fetchTeam();
  };

  const roleColor = (r: string) =>
    r === "superadmin" ? "#fbbf24" : r === "admin" ? ACCENT : "#555";

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Admin</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>Team</h1>
      </div>

      {/* Add member (superadmin only) */}
      {isSuperAdmin && (
        <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Add Team Member</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              id="team-wallet-input"
              value={newW} onChange={e => setNewW(e.target.value)}
              placeholder="Wallet address…"
              style={inp}
            />
            <input
              id="team-name-input"
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Name (optional)"
              style={{ ...inp, maxWidth: 160 }}
            />
            <select
              id="team-role-select"
              value={newRole} onChange={e => setNewRole(e.target.value)}
              style={{ ...inp, maxWidth: 130 }}
            >
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
              <option value="superadmin">superadmin</option>
            </select>
            <button
              id="team-add-btn"
              onClick={add} disabled={adding || !newW.trim()}
              style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg, #7D71D3, #9945FF)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, opacity: adding || !newW.trim() ? 0.5 : 1 }}
            >{adding ? "Adding…" : "Add"}</button>
          </div>
          {error && <div style={{ color: "#f87171", fontSize: 11, marginTop: 8 }}>{error}</div>}
        </div>
      )}

      {/* Team list */}
      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 160px 1fr 80px", gap: 8, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700 }}>
          <span>Wallet</span><span>Name</span><span>Role</span><span>Added</span><span></span>
        </div>

        {loading ? (
          <div style={{ padding: 20, color: "#555", fontSize: 13 }}>Loading team…</div>
        ) : team.length === 0 ? (
          <div style={{ padding: 20, color: "#555", fontSize: 13 }}>No team members yet.</div>
        ) : team.map(m => (
          <div key={m.wallet} style={{ display: "grid", gridTemplateColumns: "2fr 100px 160px 1fr 80px", gap: 8, padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)", alignItems: "center" }}>
            <span style={{ color: "#aaa", fontFamily: "monospace", fontSize: 11 }}>{m.wallet.slice(0, 10)}…{m.wallet.slice(-6)}</span>
            <span style={{ color: "#666", fontSize: 12 }}>{m.name ?? "—"}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: roleColor(m.role), textTransform: "uppercase", letterSpacing: 0.5 }}>{m.role}</span>
            <span style={{ color: "#444", fontSize: 10 }}>{m.added_at ? new Date(m.added_at).toLocaleDateString() : "—"}</span>
            {isSuperAdmin && m.wallet !== wallet && (
              <button
                id={`remove-${m.wallet.slice(0, 8)}`}
                onClick={() => remove(m.wallet)}
                style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,0.3)", background: "transparent", color: "#f87171", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
              >Remove</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  flex: 1, padding: "10px 14px", borderRadius: 9,
  border: "1px solid rgba(255,255,255,0.08)", background: "#080808",
  color: "#fff", fontSize: 12, fontFamily: "'Inter', sans-serif", outline: "none",
};
