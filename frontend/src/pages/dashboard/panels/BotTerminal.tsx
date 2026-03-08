import { useState, useRef, useEffect, useContext } from "react";
import { FONT, ACCENT } from "../icons";
import { WalletContext } from "../../../components/SolanaWalletProvider";
import { WS_BASE, API_BASE } from "../../../lib/api";

interface LogLine {
  from: "user" | "bot";
  text: string;
}

const INITIAL_LOG: LogLine[] = [
  { from: "bot", text: "👋 Zola AI bot ready. Type /help to see all commands." },
];

export function BotTerminal() {
  const ctx       = useContext(WalletContext);
  const wallet    = ctx?.publicKey ?? null;
  const cluster   = ctx?.cluster ?? "mainnet-beta";

  const [input, setInput] = useState("");
  const [log, setLog]     = useState<LogLine[]>(INITIAL_LOG);
  const [wsReady, setWsReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef     = useRef<WebSocket | null>(null);

  // ── WebSocket connection ──────────────────────────────────────────────────
  useEffect(() => {
    if (!wallet) return;

    const url = `${WS_BASE}/ws/${wallet}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsReady(true);
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        if (data.type === "connected") {
          setLog(l => [...l, { from: "bot", text: data.message }]);
        } else if (data.type === "tx") {
          const sig = data.signature ?? "";
          const icon = data.status === "success" ? "✅" : "❌";
          setLog(l => [
            ...l,
            {
              from: "bot",
              text: `${icon} New TX: ${sig.slice(0, 10)}… (${data.status})`,
            },
          ]);
        } else if (data.type === "response") {
          setLog(l => [...l, { from: "bot", text: data.text }]);
        }
        // ignore pings
      } catch { /* ignore malformed */ }
    };

    ws.onerror  = () => setWsReady(false);
    ws.onclose  = () => { setWsReady(false); wsRef.current = null; };

    return () => { ws.close(); };
  }, [wallet]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // ── Command submission ────────────────────────────────────────────────────
  const submit = async () => {
    const cmd = input.trim();
    if (!cmd) return;

    setLog(l => [...l, { from: "user", text: cmd }]);
    setInput("");

    if (!wallet) {
      setLog(l => [...l, { from: "bot", text: "⚠️ No wallet connected." }]);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/bot/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, command: cmd, cluster }),
      });
      const data = await res.json();
      setTimeout(() => {
        setLog(l => [...l, { from: "bot", text: data.response ?? "No response." }]);
      }, 200);
    } catch (e) {
      setLog(l => [...l, { from: "bot", text: `❌ Error: ${String(e)}` }]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header with WS status */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Bot Terminal</div>
          <span style={{ fontSize: 10, fontWeight: 700, background: cluster === "devnet" ? "rgba(251,191,36,0.1)" : "rgba(74,222,128,0.08)", color: cluster === "devnet" ? "#fbbf24" : "#4ade80", border: `1px solid ${cluster === "devnet" ? "rgba(251,191,36,0.3)" : "rgba(74,222,128,0.2)"}`, borderRadius: 5, padding: "2px 7px", letterSpacing: 1, textTransform: "uppercase" as const }}>
            {cluster}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: wsReady ? "#4ade80" : "#555" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: wsReady ? "#4ade80" : "#333", boxShadow: wsReady ? "0 0 6px #4ade80" : "none" }} />
          {wsReady ? "Live" : wallet ? "Connecting…" : "No wallet"}
        </div>
      </div>

      {/* Log area */}
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

      {/* Input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="what would you like to do with zola today?"
          style={{ flex: 1, background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: "monospace", outline: "none" }}
        />
        <button onClick={submit} style={{ background: `rgba(125,113,211,0.15)`, border: `1px solid rgba(125,113,211,0.3)`, borderRadius: 10, padding: "10px 16px", color: ACCENT, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
          Run
        </button>
      </div>
    </div>
  );
}
