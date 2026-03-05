import { useState, useRef, useEffect } from "react";
import { FONT, ACCENT } from "../icons";

const COMMANDS: Record<string, string> = {
  "/help":    "Available commands:\n  /pay @handle <amount> — send SOL via X\n  /balance — show wallet balance\n  /tip @handle <amount> — tip a user\n  /history — recent transactions\n  /alerts — manage Telegram alerts\n  /status — bot connection status",
  "/balance": "💰 Fetching live balance…",
  "/history": "Recent transactions:\n  ▸ +2.4 SOL from Tensor (03 Mar)\n  ▸ -0.85 SOL to Jupiter swap (01 Mar)\n  ▸ -1.2 SOL via bot pay (28 Feb)",
  "/status":  "✅ Telegram: Connected (@yourhandle)\n✅ X (Twitter): Connected (@yourX)\n🟣 Wallet: Connected",
  "/alerts":  "Notification settings:\n  ✅ Incoming payments\n  ✅ Bot executions\n  ✅ Vote alerts\n  Toggle in the Notifications tab.",
};

export function BotTerminal() {
  const [input,  setInput]  = useState("");
  const [log,    setLog]    = useState<{ from: "user" | "bot"; text: string }[]>([
    { from: "bot", text: "👋 Zola AI bot ready. Type /help to see all commands." },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);

  const submit = () => {
    const cmd = input.trim();
    if (!cmd) return;
    const newLog = [...log, { from: "user" as const, text: cmd }];
    const key = Object.keys(COMMANDS).find(k => cmd.toLowerCase().startsWith(k));
    const response = key ? COMMANDS[key] : `Unknown command: "${cmd}". Type /help for available commands.`;
    setTimeout(() => setLog(l => [...l, { from: "bot", text: response }]), 400);
    setLog(newLog);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Bot Terminal</div>
      <div style={{ flex: 1, overflowY: "auto", background: "#0a0a0a", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)", padding: "14px", marginBottom: 10, minHeight: 0 }}>
        {log.map((l, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: l.from === "user" ? ACCENT : "#4ade80", marginRight: 8 }}>
              {l.from === "user" ? "you" : "zola"}
            </span>
            <span style={{ fontSize: 13, color: l.from === "user" ? "#ccc" : "#aaa", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
              {l.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="/pay @handle 1.5"
          style={{ flex: 1, background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: "monospace", outline: "none" }}
        />
        <button onClick={submit} style={{ background: `rgba(125,113,211,0.15)`, border: `1px solid rgba(125,113,211,0.3)`, borderRadius: 10, padding: "10px 16px", color: ACCENT, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
          Run
        </button>
      </div>
    </div>
  );
}
