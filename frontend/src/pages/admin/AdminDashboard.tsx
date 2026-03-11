import { useState, useEffect, useCallback } from "react";
import { adminApi, type AdminStats } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Users, UserPlus, Repeat, Activity, DollarSign, WalletCards, MessageCircle, Twitter } from "lucide-react";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

function StatCard({ label, value, sub, accent, icon: Icon }: { label: string; value: string | number; sub?: string; accent?: boolean, icon?: React.ElementType }) {
  return (
    <div style={{
      background: "#0e0e10", border: `1px solid ${accent ? "rgba(125,113,211,0.25)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: 14, padding: "18px 20px", position: "relative"
    }}>
      {Icon && <Icon size={20} style={{ position: "absolute", top: 18, right: 20, color: accent ? ACCENT : "#444" }} />}
      <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ? ACCENT : "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export default function AdminDashboard({ wallet }: { wallet: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(() => {
    adminApi<AdminStats>("/admin/stats", wallet)
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [wallet]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, [fetchStats]);


  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Admin</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: 0 }}>Dashboard</h1>
        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Refreshes every 60s</div>
      </div>

      {loading ? (
        <div style={{ color: "#555", fontSize: 13 }}>Loading stats…</div>
      ) : stats && (
        <>
          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
            <StatCard label="Total Users"   value={stats.total_users} icon={Users} />
            <StatCard label="Pro Users"     value={stats.pro_users}   accent sub={`${stats.free_users} free`} icon={UserPlus} />
            <StatCard label="Swaps Today"   value={stats.swaps_today} sub={`${stats.swaps_this_month} this month`} icon={Repeat} />
            <StatCard label="Active DCAs"   value={stats.active_dca_tasks} icon={Activity} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
            <StatCard label="Fee Revenue (all time)" value={`$${stats.total_fee_revenue_usd.toFixed(2)}`} accent icon={DollarSign} />
            <StatCard label="Sub Revenue (all time)" value={`$${stats.total_pro_revenue_usd.toFixed(2)}`} icon={WalletCards} />
            <StatCard label="Telegram Linked" value={stats.telegram_linked} icon={MessageCircle} />
            <StatCard label="Twitter Linked"  value={stats.twitter_linked} icon={Twitter} />
          </div>

          {/* Chart */}
          <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>Swap Activity (last 14 days)</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stats.chart_history} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tickFormatter={(t) => new Date(t).toLocaleDateString("en", { weekday: "short" })} tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(l) => new Date(l as string).toLocaleDateString("en", { dateStyle: "medium" })} contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(125,113,211,0.08)" }} />
                <Bar dataKey="swaps" fill={ACCENT} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Volume chart */}
          <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
            <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>Estimated Fee Revenue (last 14 days) USD</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={stats.chart_history} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="day" tickFormatter={(t) => new Date(t).toLocaleDateString("en", { weekday: "short" })} tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={(l) => new Date(l as string).toLocaleDateString("en", { dateStyle: "medium" })} formatter={((v: unknown) => { const n = Number(v); return isNaN(n) ? ["-", "Revenue"] : [`$${n.toFixed(2)}`, "Revenue"]; }) as Parameters<typeof Tooltip>[0]["formatter"]} contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(125,113,211,0.08)" }} />
                <Bar dataKey="revenue" fill="#9945FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
