import { useState, useEffect, useContext } from "react";
import { WalletContext } from "@/components/WalletContext";
import { api, post } from "@/lib/api";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

interface Target { token: string; target: string; direction: "above" | "below" }

interface AlertsConfig {
  price_targets: string;
  whale_threshold: number;
  ai_insights: number;
}

export function ProAlerts() {
  const ctx = useContext(WalletContext);
  const wallet = ctx?.publicKey ?? null;

  const [targets,   setTargets]   = useState<Target[]>([]);
  const [whale,     setWhale]     = useState(10000);
  const [aiOn,      setAiOn]      = useState(true);
  const [custom,    setCustom]    = useState("");
  const [saved,     setSaved]     = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!wallet) return;
    api<AlertsConfig>(`/api/pro/alerts/${wallet}?wallet=${wallet}`)
      .then((cfg: AlertsConfig) => {
        try { setTargets(JSON.parse(cfg.price_targets ?? "[]")); } catch { setTargets([]); }
        setWhale(cfg.whale_threshold ?? 10000);
        setAiOn(!!cfg.ai_insights);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet]);

  const addTarget = () => setTargets(prev => [...prev, { token: "SOL", target: "", direction: "above" }]);
  const removeTarget = (i: number) => setTargets(prev => prev.filter((_, idx) => idx !== i));
  const updateTarget = (i: number, field: keyof Target, value: string) => {
    setTargets(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  };

  const save = async () => {
    if (!wallet) return;
    setSaving(true);
    const validTargets = targets.filter(t => t.token && t.target);
    try {
      await post(`/api/pro/alerts?wallet=${wallet}`, {
        wallet,
        price_targets: JSON.stringify(validTargets),
        whale_threshold: whale,
        ai_insights: aiOn ? 1 : 0,
        custom_triggers: custom || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ color: "#555", fontFamily: FONT, padding: 20 }}>Loading alert configuration…</div>
  );

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Price Targets */}
      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Price Target Alerts</div>
          <button
            id="add-price-target"
            onClick={addTarget}
            style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${ACCENT}`, background: "rgba(125,113,211,0.1)", color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}
          >+ Add Target</button>
        </div>

        {targets.length === 0 && (
          <div style={{ color: "#444", fontSize: 12 }}>No price targets set. Add one to get Telegram alerts when price hits your level.</div>
        )}

        {targets.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input
              value={t.token}
              onChange={e => updateTarget(i, "token", e.target.value)}
              placeholder="SOL"
              style={inputStyle}
            />
            <select
              value={t.direction}
              onChange={e => updateTarget(i, "direction", e.target.value as "above" | "below")}
              style={inputStyle}
            >
              <option value="above">above</option>
              <option value="below">below</option>
            </select>
            <input
              value={t.target}
              onChange={e => updateTarget(i, "target", e.target.value)}
              placeholder="$150"
              type="number"
              style={inputStyle}
            />
            <button onClick={() => removeTarget(i)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
          </div>
        ))}
      </div>

      {/* Whale Threshold */}
      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
          Whale Alert Threshold
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <input
            id="whale-threshold-slider"
            type="range"
            min={1000}
            max={1000000}
            step={1000}
            value={whale}
            onChange={e => setWhale(Number(e.target.value))}
            style={{ flex: 1, accentColor: ACCENT }}
          />
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", minWidth: 90, textAlign: "right" }}>
            ${whale.toLocaleString()}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#444", marginTop: 6 }}>
          Alert when any wallet transaction exceeds this USD value
        </div>
      </div>

      {/* AI Insights Toggle */}
      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>AI Hourly Insights</div>
          <div style={{ fontSize: 12, color: "#555" }}>Receive Gemini-powered market analysis every hour via Telegram</div>
        </div>
        <button
          id="ai-insights-toggle"
          onClick={() => setAiOn(!aiOn)}
          style={{
            width: 44, height: 24, borderRadius: 12, border: "none",
            background: aiOn ? ACCENT : "#222", cursor: "pointer",
            position: "relative", transition: "background 0.2s",
          }}
        >
          <div style={{
            position: "absolute", top: 3, left: aiOn ? 23 : 3,
            width: 18, height: 18, borderRadius: "50%",
            background: "#fff", transition: "left 0.2s",
          }} />
        </button>
      </div>

      {/* Custom Triggers */}
      <div style={{ background: "#0e0e10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Custom AI Trigger</div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
          Describe a condition in natural language — Gemini will monitor and alert you.
        </div>
        <textarea
          id="custom-trigger-input"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder='e.g. "Alert me when SOL breaks above its 7-day high"'
          style={{
            ...inputStyle,
            width: "100%", height: 72, resize: "vertical", lineHeight: 1.5,
          }}
        />
      </div>

      {/* Save */}
      <button
        id="save-alerts-btn"
        onClick={save}
        disabled={saving}
        style={{
          padding: "14px 0", borderRadius: 12,
          background: saved ? "#4ade80" : "#161616",
          border: saved ? "none" : "1px solid rgba(255,255,255,0.1)",
          color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer",
          fontFamily: FONT, transition: "background 0.3s",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saved ? "Saved" : saving ? "Saving…" : "Save Alert Config"}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1, padding: "9px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.1)", background: "#080808",
  color: "#fff", fontSize: 12, fontFamily: "'Inter', sans-serif",
  outline: "none",
};
