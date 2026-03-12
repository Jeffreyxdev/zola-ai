import { useContext, useEffect, useState } from "react";
import { WalletContext } from "@/components/WalletContext";
import { api, post, getSolanaRpcUrl, type ZolaSubscription } from "../lib/api";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

interface ProBadgeProps {
  onUpgrade?: () => void;
}

export function ProBadge({ onUpgrade }: ProBadgeProps) {
  const ctx = useContext(WalletContext);
  const wallet = ctx?.publicKey ?? null;
  const [sub, setSub] = useState<ZolaSubscription | null>(null);

  useEffect(() => {
    if (!wallet) return;
    api<ZolaSubscription>(`/api/subscription/${wallet}`)
      .then(setSub)
      .catch(() => {});
  }, [wallet]);

  if (!wallet || !sub) return null;

  const isPro = sub.plan === "pro";
  const expiry = sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : null;

  if (!isPro) {
    return (
      <button
        id="pro-upgrade-badge"
        onClick={onUpgrade}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 20,
          background: "#161616", border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          fontFamily: FONT, letterSpacing: 0.3,
          transition: "all 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.04)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 13 9 20 9"/><path d="M19.5 14.5v5.25a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V4.5a.75.75 0 0 1 .75-.75H13"/></svg>
        Upgrade to Pro · $6/mo
      </button>
    );
  }

  return (
    <div
      id="pro-active-badge"
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 12px", borderRadius: 20,
        background: "rgba(125,113,211,0.15)",
        border: "1px solid rgba(125,113,211,0.4)",
        fontFamily: FONT,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: ACCENT }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>PRO</span>
      {expiry && <span style={{ fontSize: 10, color: "#555" }}>until {expiry}</span>}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// ProModal
// --------------------------------------------------------------------------- //
interface ProModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const FEATURES = [
  { label: "Jupiter Swaps", free: "✓", pro: "✓" },
  { label: "DCA Strategies", free: "✓", pro: "✓" },
  { label: "Telegram Alerts", free: "Basic", pro: "Advanced" },
  { label: "Wallet Analytics", free: "—", pro: "✓ Full PnL" },
  { label: "AI Portfolio Insights", free: "Hourly (shared)", pro: "Real-time" },
  { label: "Price Target Alerts", free: "—", pro: "✓" },
  { label: "Whale TX Alerts", free: "—", pro: "✓" },
  { label: "Sniper Analysis", free: "—", pro: "✓" },
  { label: "Custom AI Triggers", free: "—", pro: "✓" },
];

type Step = "compare" | "paying" | "confirming" | "success" | "error";

export function ProModal({ onClose, onSuccess }: ProModalProps) {
  const ctx    = useContext(WalletContext);
  const wallet = ctx?.publicKey ?? null;

  const [token,     setToken]     = useState<"SOL" | "USDC">("SOL");
  const [step,      setStep]      = useState<Step>("compare");
  const [quote,     setQuote]     = useState<{ amount: number; recipient: string; sol_price: number; blockhash?: string } | null>(null);
  const [errorMsg,  setErrorMsg]  = useState("");
  const [loading,   setLoading]   = useState(false);

  // Fetch quote on mount and on token toggle
  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    post<{ amount: number; recipient: string; sol_price: number; blockhash?: string }>("/api/subscribe", { wallet, token })
      .then(setQuote)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [wallet, token]);

  const handleSubscribe = async () => {
    if (!wallet || !quote) return;
    setStep("paying");
    try {
      // Build and send transaction via Phantom
      const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } =
        await import("@solana/web3.js");

      const connection = new Connection(getSolanaRpcUrl(ctx?.cluster), "confirmed");
      const fromPubkey = new PublicKey(wallet);
      const toPubkey   = new PublicKey(quote.recipient);

      const lamports = Math.floor(quote.amount * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
      );
      tx.feePayer = fromPubkey;
      tx.recentBlockhash = quote.blockhash;
      if (!tx.recentBlockhash) {
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      }

      // Sign via Phantom
      const phantom = (window as unknown as Record<string, unknown>).solana as {
        signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>;
      } | undefined;

      if (!phantom || typeof phantom.signAndSendTransaction !== "function") {
        throw new Error("Phantom wallet not found");
      }

      setStep("confirming");
      const { signature } = await phantom.signAndSendTransaction(tx);

      // Tell backend (it will poll for confirmation using its RPC)
      await post("/api/subscribe/confirm", { wallet, tx_signature: signature });

      setStep("success");
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setStep("error");
    }
  };

  return (
    <div
      id="pro-modal-overlay"
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(8px)", display: "flex", alignItems: "center",
        justifyContent: "center", zIndex: 100, padding: 16,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#0e0e10", border: "1px solid rgba(125,113,211,0.18)",
        borderRadius: 18, width: "100%", maxWidth: 500,
        padding: "clamp(20px, 5vw, 32px)",
        fontFamily: FONT, position: "relative",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(125,113,211,0.08)",
        maxHeight: "calc(100vh - 32px)", overflowY: "auto",
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 18, background: "none",
          border: "none", color: "#555", fontSize: 20, cursor: "pointer",
        }}>×</button>

        {step === "compare" && (
          <>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "rgba(125,113,211,0.12)", border: "1px solid rgba(125,113,211,0.2)",
                display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>
                Upgrade to <span style={{ color: ACCENT }}>Zola Pro</span>
              </h2>
              <p style={{ color: "#555", fontSize: 13, marginTop: 6 }}>
                Unlock advanced analytics, alerts, and AI insights
              </p>
            </div>

            {/* Feature table */}
            <div style={{ background: "#0a0a0c", borderRadius: 12, padding: 16, marginBottom: 20, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 4, marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1 }}>Feature</span>
                <span style={{ fontSize: 10, color: "#444", textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>Free</span>
                <span style={{ fontSize: 10, color: ACCENT, textAlign: "center", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Pro</span>
              </div>
              {FEATURES.map(f => (
                <div key={f.label} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 4, padding: "7px 0", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 12, color: "#888" }}>{f.label}</span>
                  <span style={{ fontSize: 12, color: "#444", textAlign: "center" }}>{f.free}</span>
                  <span style={{ fontSize: 12, color: f.pro === "—" ? "#444" : "#4ade80", textAlign: "center", fontWeight: f.pro !== "—" ? 600 : 400 }}>{f.pro}</span>
                </div>
              ))}
            </div>

            {/* Token selector */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>Pay with</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["SOL", "USDC"] as const).map(t => (
                  <button
                    key={t}
                    id={`pay-token-${t.toLowerCase()}`}
                    onClick={() => setToken(t)}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 10,
                      border: `1px solid ${token === t ? ACCENT : "rgba(255,255,255,0.08)"}`,
                      background: token === t ? "rgba(125,113,211,0.14)" : "rgba(255,255,255,0.03)",
                      color: token === t ? "#fff" : "#555",
                      fontSize: 13, fontWeight: token === t ? 700 : 500,
                      cursor: "pointer", fontFamily: FONT, transition: "all 0.15s",
                    }}
                  >{t}</button>
                ))}
              </div>
              {quote && (
                <div style={{ marginTop: 10, textAlign: "center", fontSize: 13, color: "#888" }}>
                  {loading ? "Loading price…" : (
                    <>You'll send <strong style={{ color: "#fff" }}>{quote.amount.toFixed(token === "SOL" ? 5 : 2)} {token}</strong>
                      {token === "SOL" && <span style={{ color: "#555" }}> (@ ${quote.sol_price.toFixed(2)}/SOL)</span>}
                      <strong style={{ color: "#fff" }}> = $6.00/month</strong>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Subscribe button */}
            <button
              id="pro-subscribe-btn"
              onClick={handleSubscribe}
              disabled={!quote || !wallet || loading}
              style={{
                width: "100%", padding: "15px 0", borderRadius: 12,
                background: "#161616", border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
                fontFamily: FONT, letterSpacing: 0.5,
                opacity: !quote || !wallet || loading ? 0.5 : 1,
                transition: "all 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
            >
              Subscribe · $6/month
            </button>
            <p style={{ textAlign: "center", color: "#444", fontSize: 11, marginTop: 10 }}>
              Cancel anytime. Renews monthly until cancelled.
            </p>
          </>
        )}

        {step === "paying" && (
          <div style={{ textAlign: "center", padding: "36px 0" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px",
              background: "rgba(125,113,211,0.1)", border: "1px solid rgba(125,113,211,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
            </div>
            <h3 style={{ color: "#fff", fontWeight: 700 }}>Check your wallet</h3>
            <p style={{ color: "#555", fontSize: 13, marginTop: 8 }}>Confirm the transaction in Phantom to continue…</p>
          </div>
        )}

        {step === "confirming" && (
          <div style={{ textAlign: "center", padding: "36px 0" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 16px",
              background: "rgba(125,113,211,0.1)", border: "1px solid rgba(125,113,211,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </div>
            <h3 style={{ color: "#fff", fontWeight: 700 }}>Confirming on-chain…</h3>
            <p style={{ color: "#555", fontSize: 13, marginTop: 8 }}>This usually takes 2–5 seconds</p>
          </div>
        )}

        {step === "success" && (
          <div style={{ textAlign: "center", padding: "36px 0" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", margin: "0 auto 14px",
              background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style={{ color: "#4ade80", fontSize: 20, fontWeight: 800 }}>Welcome to Pro!</h3>
            <p style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
              Your Zola Pro subscription is now active. Enjoy advanced analytics, alerts, and AI insights.
            </p>
            <button
              id="pro-success-close"
              onClick={onClose}
              style={{
                marginTop: 24, padding: "12px 32px", borderRadius: 10, border: "none",
                background: ACCENT, color: "#fff", fontSize: 14, fontWeight: 700,
                cursor: "pointer", fontFamily: FONT,
              }}
            >Done</button>
          </div>
        )}

        {step === "error" && (
          <div style={{ textAlign: "center", padding: "36px 0" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, margin: "0 auto 14px",
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h3 style={{ color: "#f87171", fontWeight: 700, marginBottom: 0 }}>Payment failed</h3>
            <p style={{ color: "#555", fontSize: 12, marginTop: 8, maxWidth: 320, margin: "8px auto 0" }}>{errorMsg}</p>
            <button
              onClick={() => setStep("compare")}
              style={{
                marginTop: 20, padding: "10px 24px", borderRadius: 8, border: `1px solid ${ACCENT}`,
                background: "transparent", color: ACCENT, fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: FONT,
              }}
            >Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
