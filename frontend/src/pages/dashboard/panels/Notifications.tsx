import { useState } from "react";
import { ACCENT } from "../icons";

type Key = "incomingPayments" | "botExecutions" | "voteAlerts" | "tipReceived" | "failedCommands" | "dailySummary";

const ITEMS: { key: Key; label: string; sub: string }[] = [
  { key: "incomingPayments", label: "Incoming Payments", sub: "Alert when SOL is received in your wallet"            },
  { key: "botExecutions",    label: "Bot Executions",    sub: "Alert when bot executes a command on your behalf"     },
  { key: "voteAlerts",       label: "Vote Alerts",       sub: "Notify when new DAO proposals need your vote"         },
  { key: "tipReceived",      label: "Tips Received",     sub: "Alert when someone tips you via X @tag"               },
  { key: "failedCommands",   label: "Failed Commands",   sub: "Notify when a bot command fails"                      },
  { key: "dailySummary",     label: "Daily Summary",     sub: "Receive a daily digest of all bot activity"          },
];

export function Notifications() {
  const [settings, setSettings] = useState<Record<Key, boolean>>({
    incomingPayments: true,
    botExecutions:    true,
    voteAlerts:       true,
    tipReceived:      true,
    failedCommands:   false,
    dailySummary:     false,
  });

  const toggle = (k: Key) => setSettings(s => ({ ...s, [k]: !s[k] }));

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Notification Settings</div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 16 }}>Delivered via Telegram bot</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {ITEMS.map(item => (
          <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>{item.label}</div>
              <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{item.sub}</div>
            </div>
            <button onClick={() => toggle(item.key)} style={{
              width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
              position: "relative", flexShrink: 0,
              background: settings[item.key] ? ACCENT : "rgba(255,255,255,0.1)",
              transition: "background 0.2s",
              boxShadow: settings[item.key] ? `0 0 10px rgba(125,113,211,0.4)` : "none",
            }}>
              <span style={{ position: "absolute", top: 3, left: settings[item.key] ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
