import { useState, useEffect, useContext } from "react";
import { WalletContext } from "@/components/WalletContext";
import { api, type ProAnalytics } from "@/lib/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";
const PIE_COLORS = ["#7D71D3", "#9945FF", "#03E1FF", "#4ade80", "#fbbf24"];

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14, padding: "18px 20px", fontFamily: FONT,
    }}>
      <div style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? "#fff", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function ProAnalytics() {
  const ctx = useContext(WalletContext);
  const wallet = ctx?.publicKey ?? null;

  const [data, setData]     = useState<ProAnalytics | null>(null);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<"overview" | "sniper">("overview");

  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    api<ProAnalytics>(`/api/pro/analytics/${wallet}?wallet=${wallet}`)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    // Reset loading when wallet changes — do NOT call setLoading here directly
    // (handled by state initializer; wallet changes re-mount so loading stays true
    // until the promise resolves)
    return () => { cancelled = true; };
  }, [wallet]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: "#555", fontFamily: FONT }}>
      <div>Loading analytics…</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 24, background: "rgba(248,113,113,0.08)", borderRadius: 12, border: "1px solid rgba(248,113,113,0.2)", fontFamily: FONT }}>
      <div style={{ color: "#f87171", fontWeight: 700, marginBottom: 4 }}>Analytics Error</div>
      <div style={{ color: "#555", fontSize: 13 }}>{error}</div>
    </div>
  );

  if (!data) return null;

  const pnlColor = data.pnl_usd >= 0 ? "#4ade80" : "#f87171";
  const pieData = data.top_tokens.map(t => ({ name: t.token, value: t.value_usd }));

  return (
    <div style={{ fontFamily: FONT }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["overview", "sniper"] as const).map(t => (
          <button
            key={t}
            id={`analytics-tab-${t}`}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: tab === t ? "rgba(125,113,211,0.18)" : "rgba(255,255,255,0.04)",
              color: tab === t ? ACCENT : "#555",
              fontSize: 12, fontWeight: tab === t ? 700 : 500,
              cursor: "pointer", fontFamily: FONT, textTransform: "capitalize",
              borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
            }}
          >{t === "sniper" ? "Sniper" : "Overview"}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            <StatCard label="SOL Balance" value={`${data.sol_balance.toFixed(4)} SOL`} sub={`$${data.balance_usd.toFixed(2)}`} />
            <StatCard label="PnL" value={`${data.pnl_usd >= 0 ? "+" : ""}$${data.pnl_usd.toFixed(2)}`} color={pnlColor} />
            <StatCard label="Transactions" value={String(data.tx_count)} sub="Last 50 fetched" />
          </div>

          {/* Portfolio pie chart */}
          {pieData.length > 0 && (
            <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Portfolio Breakdown</div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" stroke="none">
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={((v: unknown) => { const n = Number(v); return isNaN(n) ? ["-", ""] : [`$${n.toFixed(2)}`, ""]; }) as Parameters<typeof Tooltip>[0]["formatter"]} contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1 }}>
                  {pieData.map((d, i) => (
                    <div key={d.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span style={{ fontSize: 12, color: "#888" }}>{d.name}</span>
                      </div>
                      <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>${d.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* AI Recommendation */}
          <div style={{ background: "linear-gradient(135deg, rgba(125,113,211,0.1), rgba(153,69,255,0.06))", border: "1px solid rgba(125,113,211,0.2)", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>AI Recommendation</div>
            <p style={{ color: "#bbb", fontSize: 13, lineHeight: 1.65, margin: 0 }}>{data.ai_recommendation}</p>
          </div>
        </>
      )}

      {tab === "sniper" && <SniperPanel wallet={wallet!} />}
    </div>
  );
}

function SniperPanel({ wallet }: { wallet: string }) {
  const [opportunities, setOpportunities] = useState<{ token: string; score: number; reason: string; risk_level: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    let cancelled = false;
    api<{ opportunities: typeof opportunities }>(`/api/pro/sniper/${wallet}?wallet=${wallet}`)
      .then(r => { if (!cancelled) { setOpportunities(r.opportunities ?? []); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [wallet]);

  const riskColor = (r: string) => r === "low" ? "#4ade80" : r === "medium" ? "#fbbf24" : "#f87171";

  if (loading) return <div style={{ color: "#555", fontFamily: FONT, padding: 24 }}>Scanning for opportunities…</div>;
  if (error) return <div style={{ color: "#f87171", fontFamily: FONT, padding: 24 }}>{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>AI-scored token launch opportunities on Solana</div>
      {opportunities.length === 0 && <div style={{ color: "#555", fontSize: 13 }}>No opportunities found right now. Check back soon.</div>}
      {opportunities.map((o: { token: string; score: number; reason: string; risk_level: string }, i: number) => (
        <div key={i} style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{o.token}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: riskColor(o.risk_level), background: `${riskColor(o.risk_level)}18`, border: `1px solid ${riskColor(o.risk_level)}44`, borderRadius: 5, padding: "2px 8px", fontWeight: 700, textTransform: "capitalize" }}>{o.risk_level} risk</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: o.score >= 70 ? "#4ade80" : o.score >= 50 ? "#fbbf24" : "#f87171" }}>{o.score}/100</span>
            </div>
          </div>
          <p style={{ color: "#666", fontSize: 12, margin: 0, lineHeight: 1.5 }}>{o.reason}</p>
        </div>
      ))}
    </div>
  );
}
