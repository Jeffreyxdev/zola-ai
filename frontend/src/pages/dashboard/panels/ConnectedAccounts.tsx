import React, { useState } from "react";
import { IC, FONT, ACCENT } from "../icons";

function Account({ icon, label, sub, connected, onToggle, color }: {
  icon: React.ReactNode; label: string; sub: string;
  connected: boolean; onToggle: () => void; color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${connected ? "rgba(125,113,211,0.2)" : "rgba(255,255,255,0.06)"}`, marginBottom: 10 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd" }}>{label}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: connected ? "#4ade80" : "#f87171", fontWeight: 600, whiteSpace: "nowrap" }}>{connected ? "● On" : "● Off"}</span>
        <button onClick={onToggle} style={{
          background: connected ? "rgba(248,113,113,0.1)" : "rgba(125,113,211,0.12)",
          border: `1px solid ${connected ? "rgba(248,113,113,0.3)" : "rgba(125,113,211,0.3)"}`,
          borderRadius: 8, padding: "5px 12px", cursor: "pointer",
          color: connected ? "#f87171" : ACCENT,
          fontSize: 11, fontWeight: 600, fontFamily: FONT,
        }}>
          {connected ? "Unlink" : "Connect"}
        </button>
      </div>
    </div>
  );
}

export function ConnectedAccounts() {
  const [tg, setTg] = useState(true);
  const [tw, setTw] = useState(true);

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 14 }}>Connected Accounts</div>
      <Account
        icon={IC.telegram} label="Telegram"
        sub={tg ? "Receiving vote + payment alerts" : "Not connected — no alerts active"}
        connected={tg} onToggle={() => setTg(!tg)}
        color="linear-gradient(135deg,#229ED9,#1a7db5)"
      />
      <Account
        icon={IC.twitter} label="X (Twitter)"
        sub={tw ? "Bot can execute @tag payments" : "Not connected — @tag payments disabled"}
        connected={tw} onToggle={() => setTw(!tw)}
        color="#111"
      />
      {(!tg || !tw) && (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 12, color: "#fbbf24" }}>
          ⚠️ {!tg && !tw ? "Both accounts disconnected." : !tg ? "Telegram disconnected — no alerts." : "X disconnected — @tag payments won't work."}
        </div>
      )}
    </div>
  );
}
