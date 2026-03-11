import { useState, useEffect } from "react";
import { adminApi } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { AdminRevenue as AdminRevenueType } from "../../lib/api";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

function RevenueCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AdminRevenue({ wallet }: { wallet: string }) {
  const [data, setData]   = useState<AdminRevenueType | null>(null);
  const [loading, setLoad] = useState(true);

  useEffect(() => {
    adminApi<AdminRevenueType>("/admin/revenue", wallet)
      .then(setData).catch(console.error).finally(() => setLoad(false));
  }, [wallet]);

  const chartData = data?.chart_data ?? [];

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Admin</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: 0 }}>Revenue</h1>
      </div>

      {loading ? <div style={{ color: "#555" }}>Loading…</div> : data && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            <RevenueCard label="Today"      value={`$${data.today.toFixed(2)}`} />
            <RevenueCard label="This Week"  value={`$${data.this_week.toFixed(2)}`} />
            <RevenueCard label="This Month" value={`$${data.this_month.toFixed(2)}`} />
            <RevenueCard label="All Time"   value={`$${data.all_time.toFixed(2)}`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <RevenueCard label="Fee Revenue (Jupiter)"  value={`$${data.fee_revenue.toFixed(2)}`}         sub="From swap referrals" />
            <RevenueCard label="Sub Revenue"            value={`$${data.subscription_revenue.toFixed(2)}`} sub="From Pro subscriptions" />
          </div>

          {/* Token breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <RevenueCard label="SOL Payments"  value={`${data.by_token.SOL.toFixed(4)} SOL`} />
            <RevenueCard label="USDC Payments" value={`$${data.by_token.USDC.toFixed(2)} USDC`} />
          </div>

          {/* Daily chart */}
          {chartData.length > 0 && (
            <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 24 }}>
              <div style={{ fontSize: 12, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>Fee Revenue — Last 30 Days (USD)</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="day" tick={{ fill: "#444", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#444", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: unknown) => [`$${Number(v).toFixed(4)}`, "Revenue"]} contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 11 }} cursor={{ fill: "rgba(125,113,211,0.08)" }} />
                  <Bar dataKey="revenue" fill={ACCENT} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
