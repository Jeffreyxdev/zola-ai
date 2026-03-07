import { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { WalletContext } from "../../components/SolanaWalletProvider";
import { IC, FONT, ACCENT } from "./icons";
import type { NavItem } from "./types";
import { api } from "../../lib/api";

import { WalletOverview }    from "./panels/WalletOverview";
import { SendPanel }         from "./panels/SendPanel";
import { ReceiveModal }      from "./panels/ReceiveModal";
import { BotTerminal }       from "./panels/BotTerminal";
import { TxHistory }         from "./panels/TxHistory";
import { ActivityFeed }      from "./panels/ActivityFeed";
import { ConnectedAccounts } from "./panels/ConnectedAccounts";
import { Notifications }     from "./panels/Notifications";
import { Settings }          from "./panels/Settings";

const NAV_ITEMS: { id: NavItem; label: string; icon: React.ReactElement }[] = [
  { id: "wallet",        label: "Wallet",        icon: IC.wallet   },
  { id: "terminal",      label: "Bot Terminal",  icon: IC.terminal },
  { id: "send",          label: "Send",          icon: IC.send     },
  { id: "history",       label: "History",       icon: IC.history  },
  { id: "activity",      label: "Activity",      icon: IC.activity },
  { id: "accounts",      label: "Accounts",      icon: IC.accounts },
  { id: "notifications", label: "Alerts",        icon: IC.bell     },
  { id: "settings",      label: "Settings",      icon: IC.settings },
];

const PANEL_TITLES: Record<NavItem, string> = {
  wallet:        "Welcome back",
  terminal:      "Command the bot",
  send:          "Send SOL",
  receive:       "Receive SOL",
  history:       "Transactions",
  activity:      "On-chain activity",
  accounts:      "Linked accounts",
  notifications: "Notifications",
  settings:      "Settings",
};

// ── Guide banner ────────────────────────────────────────────────────────────
function GuideBanner({ onGetStarted }: { onGetStarted: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div style={{ marginBottom: 24, padding: "18px 22px", background: "linear-gradient(135deg, rgba(125,113,211,0.12), rgba(3,225,255,0.06))", border: "1px solid rgba(125,113,211,0.22)", borderRadius: 16, display: "flex", alignItems: "center", gap: 20, position: "relative", overflow: "hidden", fontFamily: FONT }}>
      {/* left glow accent */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(to bottom, ${ACCENT}, #03E1FF)`, borderRadius: "16px 0 0 16px" }} />
      <div style={{ fontSize: 28, flexShrink: 0 }}>🚀</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 5 }}>Link your accounts to unlock Zola AI</div>
        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          📱 <strong style={{ color: "#999" }}>Telegram</strong> — get real-time wallet alerts directly in chat&nbsp;&nbsp;·&nbsp;&nbsp;
          🐦 <strong style={{ color: "#999" }}>X / Twitter</strong> — send SOL and check balances via @mentions
        </div>
      </div>
      <button
        onClick={onGetStarted}
        style={{ flexShrink: 0, padding: "10px 18px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        Get started →
      </button>
      <button
        onClick={() => setDismissed(true)}
        title="Dismiss"
        style={{ position: "absolute", top: 10, right: 12, background: "none", border: "none", color: "#444", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 2 }}
        onMouseEnter={e => (e.currentTarget.style.color = "#888")}
        onMouseLeave={e => (e.currentTarget.style.color = "#444")}
      >×</button>
    </div>
  );
}

function renderPanel(nav: NavItem, onSend: () => void, onReceive: () => void) {
  switch (nav) {
    case "wallet":        return <WalletOverview onSend={onSend} onReceive={onReceive} />;
    case "terminal":      return <BotTerminal />;
    case "send":          return <SendPanel />;
    case "history":       return <TxHistory />;
    case "activity":      return <ActivityFeed />;
    case "accounts":      return <ConnectedAccounts />;
    case "notifications": return <Notifications />;
    case "settings":      return <Settings />;
    default:              return null;
  }
}

export default function Dashboard() {
  const navigate   = useNavigate();
  const ctx        = useContext(WalletContext);
  const publicKey  = ctx?.publicKey  ?? null;
  const walletName = ctx?.walletName ?? null;
  const cluster    = ctx?.cluster    ?? "mainnet-beta";
  const disconnect = ctx?.disconnect;

  // ── Wallet guard ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!publicKey) navigate("/", { replace: true });
  }, [publicKey, navigate]);

  const shortKey = publicKey
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : "—";

  const [nav,        setNav]        = useState<NavItem>("wallet");
  const [showQR,     setShowQR]     = useState(false);
  const [sideOpen,   setSideOpen]   = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  // Fetch once to decide whether to show the guide banner
  useEffect(() => {
    if (!publicKey) return;
    api(`/api/status/${publicKey}`)
      .then((s: any) => setNeedsSetup(!s.telegram && !s.twitter))
      .catch(() => {});
  }, [publicKey]);

  const isTerminal = nav === "terminal";

  const handleNav = (id: NavItem) => { setNav(id); setSideOpen(false); };

  if (!publicKey) return null; // guard renders nothing while redirecting

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080808; overflow-x: hidden; }
        input::placeholder { color: #444; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(125,113,211,0.25); border-radius: 4px; }
        .nav-btn:hover { background: rgba(125,113,211,0.08) !important; color: #bbb !important; }

        /* Desktop sidebar */
        .dash-sidebar { display: flex; }
        /* Mobile top bar hidden on desktop */
        .dash-mob-topbar { display: none; }
        /* Mobile slide-out overlay */
        .mob-drawer-overlay { display: none; }
        .mob-drawer { display: none; }

        @media (max-width: 767px) {
          .dash-sidebar       { display: none; }
          .dash-mob-topbar    { display: flex; }
          .mob-drawer-overlay { display: block; position: fixed; inset: 0; z-index: 80; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); }
          .mob-drawer         { display: flex; position: fixed; top: 0; left: 0; bottom: 0; z-index: 90; width: 260px; background: #0c0c0c; border-right: 1px solid rgba(255,255,255,0.07); flex-direction: column; padding: 24px 12px; transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); }
          .dash-main          { padding-top: 60px !important; padding-left: 16px !important; padding-right: 16px !important; padding-bottom: 24px !important; }
        }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh", background: "#080808", fontFamily: FONT, color: "#fff" }}>

        {/* ── Desktop sidebar ─────────────────────────────────────────── */}
        <aside className="dash-sidebar" style={{ width: 220, minHeight: "100vh", background: "#0c0c0c", borderRight: "1px solid rgba(255,255,255,0.06)", flexDirection: "column", padding: "24px 12px", flexShrink: 0 }}>

          {/* Wordmark only — no icon */}
          <div style={{ padding: "0 8px", marginBottom: 32 }}>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>
              zola <span style={{ color: ACCENT }}>ai</span>
            </span>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => handleNav(item.id)} className="nav-btn" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                background:  nav === item.id ? "rgba(125,113,211,0.14)" : "transparent",
                color:       nav === item.id ? ACCENT : "#555",
                fontSize: 13, fontWeight: nav === item.id ? 700 : 500,
                fontFamily: FONT,
                borderLeft: nav === item.id ? `2px solid ${ACCENT}` : "2px solid transparent",
                transition: "all 0.15s",
              }}>
                {item.icon} {item.label}
              </button>
            ))}
          </nav>

          <button onClick={() => setShowQR(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", marginBottom: 10, borderRadius: 10, border: `1px solid rgba(125,113,211,0.25)`, background: "rgba(125,113,211,0.07)", cursor: "pointer", color: ACCENT, fontSize: 13, fontWeight: 600, fontFamily: FONT, width: "100%" }}>
            {IC.receive} Receive SOL
          </button>

          {/* Wallet badge */}
          <div style={{ background: "rgba(125,113,211,0.07)", border: "1px solid rgba(125,113,211,0.18)", borderRadius: 12, padding: "11px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg,#9945FF,#03E1FF)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{IC.solana}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#555", marginBottom: 1 }}>{walletName ?? "Wallet"}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortKey}</div>
            </div>
            {disconnect && (
              <button onClick={disconnect} title="Disconnect" style={{ background: "none", border: "none", cursor: "pointer", color: "#444", display: "flex", padding: 2, borderRadius: 5, flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                onMouseLeave={e => (e.currentTarget.style.color = "#444")}
              >{IC.logout}</button>
            )}
          </div>
        </aside>

        {/* ── Mobile top bar ────────────────────────────────────────────── */}
        <div className="dash-mob-topbar" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, background: "rgba(8,8,8,0.96)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)", height: 52, padding: "0 16px", alignItems: "center", justifyContent: "space-between" }}>
          {/* Hamburger */}
          <button onClick={() => setSideOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#888", display: "flex", alignItems: "center", gap: 10, padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>zola <span style={{ color: ACCENT }}>ai</span></span>
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {cluster === "devnet" && (
              <span style={{ fontSize: 9, fontWeight: 700, background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 5, padding: "2px 6px", letterSpacing: 1 }}>DEVNET</span>
            )}
            <button onClick={() => setShowQR(true)} style={{ background: "rgba(125,113,211,0.1)", border: `1px solid rgba(125,113,211,0.25)`, borderRadius: 8, padding: "5px 12px", color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              Receive
            </button>
          </div>
        </div>

        {/* ── Mobile slide-out drawer ───────────────────────────────────── */}
        {sideOpen && <div className="mob-drawer-overlay" onClick={() => setSideOpen(false)} />}
        <div className="mob-drawer" style={{ transform: sideOpen ? "translateX(0)" : "translateX(-100%)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>zola <span style={{ color: ACCENT }}>ai</span></span>
            <button onClick={() => setSideOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#555" }}>{IC.close}</button>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => handleNav(item.id)} className="nav-btn" style={{
                display: "flex", alignItems: "center", gap: 10, padding: "11px 12px",
                borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                background:  nav === item.id ? "rgba(125,113,211,0.14)" : "transparent",
                color:       nav === item.id ? ACCENT : "#666",
                fontSize: 14, fontWeight: nav === item.id ? 700 : 500,
                fontFamily: FONT,
                borderLeft: nav === item.id ? `2px solid ${ACCENT}` : "2px solid transparent",
              }}>
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
          {/* Wallet pill inside drawer */}
          <div style={{ background: "rgba(125,113,211,0.07)", border: "1px solid rgba(125,113,211,0.18)", borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#9945FF,#03E1FF)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{IC.solana}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#555" }}>{walletName ?? "Wallet"}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#888", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortKey}</div>
            </div>
            {disconnect && (
              <button onClick={disconnect} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", display: "flex" }}>{IC.logout}</button>
            )}
          </div>
        </div>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main className="dash-main" style={{ flex: 1, padding: "32px 36px", overflowY: "auto", minHeight: "100vh" }}>

          {/* Page header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: ACCENT, textTransform: "uppercase", marginBottom: 4 }}>
                {NAV_ITEMS.find(n => n.id === nav)?.label ?? "Dashboard"}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>
                {PANEL_TITLES[nav]}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {cluster === "devnet" && (
                <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 6, padding: "2px 8px", letterSpacing: 1 }}>DEVNET</span>
              )}
              <div style={{ fontSize: 11, color: "#444", fontFamily: "monospace" }}>{shortKey}</div>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
            </div>
          </div>

          {/* Guide banner — shown on wallet page if no accounts linked yet */}
          {nav === "wallet" && needsSetup && (
            <GuideBanner onGetStarted={() => { setNav("accounts"); setNeedsSetup(false); }} />
          )}

          {/* Panel */}
          <div style={{ maxWidth: isTerminal ? 720 : 800 }}>
            {isTerminal
              ? <div style={{ height: 500 }}><BotTerminal /></div>
              : renderPanel(nav, () => setNav("send"), () => setShowQR(true))
            }
          </div>
        </main>
      </div>

      {showQR && <ReceiveModal address={publicKey} onClose={() => setShowQR(false)} />}
    </>
  );
}