import React, { useState, useContext, useEffect, useCallback } from "react";
import { IC, FONT, ACCENT } from "../icons";
import { WalletContext } from "@/components/WalletContext";
import { post, api } from "../../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ZolaStatus {
  registered: boolean;
  telegram: boolean;
  twitter: boolean;
  twitter_handle?: string;
  cluster?: string;
}

interface TgLinkInfo {
  code: string;
  deep_link: string;
  bot_username: string;
}

// ─── Twitter modal ────────────────────────────────────────────────────────────
function TwitterModal({ onClose, onSave }: { onClose: () => void; onSave: (handle: string) => Promise<void> }) {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const cleaned = handle.replace(/^@/, "").trim();
    if (!cleaned) { setError("Enter your Twitter/X handle"); return; }
    setLoading(true);
    try { await onSave(cleaned); onClose(); }
    catch { setError("Failed to save — try again"); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28, width: 360, fontFamily: FONT }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          {IC.twitter}
          <span style={{ fontSize: 15, fontWeight: 700 }}>Link X / Twitter</span>
        </div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 16 }}>
          Your handle is used for Twitter-based bot gating (@handle commands).
        </div>
        <input
          autoFocus
          placeholder="@yourhandle"
          value={handle}
          onChange={e => setHandle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: FONT, outline: "none", boxSizing: "border-box" }}
        />
        {error && <div style={{ fontSize: 11, color: "#f87171", marginTop: 6 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#666", fontSize: 13, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ flex: 2, padding: "10px 0", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Saving…" : "Save handle"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Telegram link flow modal ─────────────────────────────────────────────────
function TelegramModal({ info, onClose, onLinked }: { info: TgLinkInfo; onClose: () => void; onLinked: () => void }) {
  const [step, setStep] = useState<"open" | "waiting" | "done">("open");
  const [dots, setDots] = useState(".");

  // Animate waiting dots
  useEffect(() => {
    if (step !== "waiting") return;
    const t = setInterval(() => setDots(d => d.length >= 3 ? "." : d + "."), 500);
    return () => clearInterval(t);
  }, [step]);

  const handleOpenTelegram = () => {
    window.open(info.deep_link, "_blank");
    setStep("waiting");
  };

  // Poll status once user is in "waiting" step
  useEffect(() => {
    if (step !== "waiting") return;
    const poll = setInterval(async () => {
      try {
        const s = await api(`/api/status-by-code?code=${info.code}`) as { linked: boolean };
        if (s.linked) { clearInterval(poll); setStep("done"); setTimeout(onLinked, 1200); }
      } catch { /* keep polling */ }
    }, 2500);
    return () => clearInterval(poll);
  }, [step, info.code, onLinked]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 32, width: 380, fontFamily: FONT, textAlign: "center" }}>

        {/* Icon */}
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0,136,204,0.15)", border: "1px solid rgba(0,136,204,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#29b6f6"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
        </div>

        {step === "done" ? (
          <>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80", marginBottom: 6 }}>Telegram linked!</div>
            <div style={{ fontSize: 12, color: "#666" }}>You'll receive wallet alerts in your Telegram chat.</div>
          </>
        ) : step === "waiting" ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Waiting for confirmation{dots}</div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
              In Telegram, press <strong style={{ color: "#fff" }}>Start</strong> — it links automatically.
            </div>
            <div style={{ fontSize: 11, color: "#444", marginBottom: 20 }}>
              Or send: <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4, color: "#aaa" }}>/link {info.code}</code>
            </div>
            <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
              Close (link later)
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Connect Telegram</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 24, lineHeight: 1.6 }}>
              Click below — Telegram opens and links your wallet automatically when you press <strong style={{ color: "#fff" }}>Start</strong>.
            </div>
            <button
              onClick={handleOpenTelegram}
              style={{ width: "100%", padding: "14px 0", borderRadius: 12, border: "none", background: "#0088cc", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              Open in Telegram
            </button>
            <button onClick={onClose} style={{ padding: "8px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#555", fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Account card ─────────────────────────────────────────────────────────────
function AccountCard({
  icon, label, connected, handle, onConnect, onDisconnect, loading,
}: {
  icon: React.ReactElement; label: string; connected: boolean; handle?: string;
  onConnect: () => void; onDisconnect?: () => void; loading?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", background: connected ? "rgba(74,222,128,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${connected ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)"}`, borderRadius: 14, transition: "all 0.2s" }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: connected ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: connected ? "#4ade80" : "#555" }}>
          {connected ? (handle ? `@${handle}` : "Connected ✓") : "Not linked"}
        </div>
      </div>
      {connected ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
          {onDisconnect && (
            <button onClick={onDisconnect} style={{ fontSize: 11, color: "#555", background: "none", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: FONT }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >Unlink</button>
          )}
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={loading}
          style={{ padding: "8px 16px", borderRadius: 10, border: `1px solid ${ACCENT}44`, background: `${ACCENT}11`, color: ACCENT, fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: FONT, opacity: loading ? 0.6 : 1, transition: "all 0.15s", whiteSpace: "nowrap" }}
          onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = `${ACCENT}22`; } }}
          onMouseLeave={e => { e.currentTarget.style.background = `${ACCENT}11`; }}
        >
          {loading ? "Loading…" : "Connect"}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ConnectedAccounts() {
  const ctx    = useContext(WalletContext);
  const wallet = ctx?.publicKey ?? null;

  const [status,    setStatus]    = useState<ZolaStatus | null>(null);
  const [tgInfo,    setTgInfo]    = useState<TgLinkInfo | null>(null);
  const [showTw,    setShowTw]    = useState(false);
  const [tgLoading, setTgLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey(k => k + 1), []);

  // Fetch linked-accounts status
  useEffect(() => {
    if (!wallet) return;
    api(`/api/status/${wallet}`)
      .then(d => setStatus(d as ZolaStatus))
      .catch(console.warn);
  }, [wallet, refreshKey]);

  const handleConnectTelegram = async () => {
    if (!wallet) return;
    setTgLoading(true);
    try {
      const res = await post("/api/link-telegram", { wallet }) as TgLinkInfo & { status: string };
      setTgInfo({ code: res.code, deep_link: res.deep_link, bot_username: res.bot_username });
    } catch { /* show nothing */ }
    finally { setTgLoading(false); }
  };

  const handleSaveTwitter = async (handle: string) => {
    if (!wallet) return;
    await post("/api/link-twitter", { wallet, twitter_handle: handle });
    reload();
  };

  if (!wallet) {
    return (
      <div style={{ textAlign: "center", padding: 48, color: "#555", fontFamily: FONT, fontSize: 14 }}>
        Connect a wallet first to manage linked accounts.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, maxWidth: 520 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
          Link your Telegram and X accounts to receive real-time wallet alerts and use the Zola AI bot on social media.
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Telegram */}
        <AccountCard
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill={status?.telegram ? "#29b6f6" : "#555"}>
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
          }
          label="Telegram"
          connected={status?.telegram ?? false}
          onConnect={handleConnectTelegram}
          loading={tgLoading}
        />

        {/* Twitter / X */}
        <AccountCard
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill={status?.twitter ? "#fff" : "#555"}>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          }
          label="X / Twitter"
          connected={status?.twitter ?? false}
          handle={status?.twitter_handle}
          onConnect={() => setShowTw(true)}
        />

      </div>

      {/* Info footer */}
      <div style={{ marginTop: 24, padding: "14px 16px", background: "rgba(125,113,211,0.06)", border: "1px solid rgba(125,113,211,0.12)", borderRadius: 12 }}>
        <div style={{ fontSize: 11, color: "#555", lineHeight: 1.7 }}>
          <strong style={{ color: "#777" }}>Telegram</strong> — Get instant TX alerts and run bot commands in chat.<br />
          <strong style={{ color: "#777" }}>X / Twitter</strong> — Mention @use_zola on X to send SOL, check balances, and more.
        </div>
      </div>

      {/* Telegram flow modal */}
      {tgInfo && (
        <TelegramModal
          info={tgInfo}
          onClose={() => setTgInfo(null)}
          onLinked={() => { setTgInfo(null); reload(); }}
        />
      )}

      {/* Twitter modal */}
      {showTw && (
        <TwitterModal
          onClose={() => setShowTw(false)}
          onSave={handleSaveTwitter}
        />
      )}
    </div>
  );
}
