import React, { useState, useContext, useCallback } from "react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { WalletContext } from "@/components/WalletContext";
import { IC, FONT, ACCENT } from "../icons";

type Step = "recipient" | "amount" | "review" | "done";

const FEE_ESTIMATE = 0.000005; // ~5000 lamports

function getRpcUrl(cluster: string) {
  return cluster === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com";
}

function isValidSolAddress(addr: string): boolean {
  try { new PublicKey(addr); return true; } catch { return false; }
}

const STEPS: { id: Step; label: string }[] = [
  { id: "recipient", label: "Recipient" },
  { id: "amount",    label: "Amount"    },
  { id: "review",    label: "Review"    },
  { id: "done",      label: "Done"      },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex(s => s.id === current);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 28 }}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s.id}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: i < idx ? ACCENT : i === idx ? `rgba(125,113,211,0.2)` : "rgba(255,255,255,0.05)",
              border: i === idx ? `1.5px solid ${ACCENT}` : i < idx ? `1.5px solid ${ACCENT}` : "1.5px solid rgba(255,255,255,0.1)",
              fontSize: 11, fontWeight: 700,
              color: i <= idx ? "#fff" : "#444",
              transition: "all 0.3s",
            }}>
              {i < idx ? IC.check : <span>{i + 1}</span>}
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: i === idx ? ACCENT : i < idx ? "#888" : "#333", letterSpacing: 0.5 }}>
              {s.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ height: 1.5, flex: 2, background: i < idx ? ACCENT : "rgba(255,255,255,0.07)", transition: "background 0.3s", marginBottom: 18 }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function SendPanel() {
  const ctx = useContext(WalletContext);
  const publicKey = ctx?.publicKey ?? null;
  const cluster   = (ctx as { publicKey: string | null; cluster?: string } | null)?.cluster ?? "mainnet-beta";

  const [step,       setStep]       = useState<Step>("recipient");
  const [mode,       setMode]       = useState<"address" | "x">("address");
  const [recipient,  setRecipient]  = useState("");
  const [amount,     setAmount]     = useState("");
  const [balance,    setBalance]    = useState<number | null>(null);
  const [addrError,  setAddrError]  = useState("");
  const [amtError,   setAmtError]   = useState("");
  const [txSig,      setTxSig]      = useState<string | null>(null);
  const [sending,    setSending]    = useState(false);
  const [sendError,  setSendError]  = useState("");

  // Fetch real balance when entering Amount step
  const fetchBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const conn = new Connection(getRpcUrl(cluster), "confirmed");
      const lamps = await conn.getBalance(new PublicKey(publicKey));
      setBalance(lamps / LAMPORTS_PER_SOL);
    } catch { setBalance(null); }
  }, [publicKey, cluster]);

  // ── Step 1: validate recipient ────────────────────────────────────────────
  const handleRecipientNext = () => {
    if (mode === "address") {
      if (!isValidSolAddress(recipient)) {
        setAddrError("Invalid Solana address");
        return;
      }
      if (publicKey && recipient === publicKey) {
        setAddrError("Can't send to yourself");
        return;
      }
    } else {
      if (!recipient.startsWith("@") || recipient.length < 2) {
        setAddrError("Enter a valid @handle");
        return;
      }
    }
    setAddrError("");
    fetchBalance();
    setStep("amount");
  };

  // ── Step 2: validate amount ───────────────────────────────────────────────
  const handleAmountNext = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setAmtError("Enter a valid amount");
      return;
    }
    if (balance !== null && num + FEE_ESTIMATE > balance) {
      setAmtError(`Insufficient balance (need ~${(num + FEE_ESTIMATE).toFixed(6)} SOL)`);
      return;
    }
    setAmtError("");
    setStep("review");
  };

  // ── Step 3: send transaction ──────────────────────────────────────────────
  const handleSend = async () => {
    setSending(true);
    setSendError("");
    try {
      const conn   = new Connection(getRpcUrl(cluster), "confirmed");
      const from   = new PublicKey(publicKey!);
      const to     = new PublicKey(recipient);
      const lamps  = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: lamps })
      );
      tx.feePayer     = from;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;

      // Use wallet adapter sign if available (Phantom injects signTransaction)
      const provider = (window as unknown as Record<string, unknown>)?.solana as { signTransaction: (tx: Transaction) => Promise<Transaction> } | undefined
        ?? (window as unknown as Record<string, { solana?: { signTransaction: (tx: Transaction) => Promise<Transaction> } }>)?.phantom?.solana;
      if (!provider) throw new Error("No wallet provider found — connect a wallet first");

      const signed = await provider.signTransaction(tx);
      const sig    = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction(sig, "confirmed");
      setTxSig(sig);
      setStep("done");
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : "Transaction failed");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setStep("recipient");
    setRecipient("");
    setAmount("");
    setBalance(null);
    setAddrError("");
    setAmtError("");
    setTxSig(null);
    setSendError("");
  };

  const shortRecipient = mode === "address" && recipient.length > 16
    ? `${recipient.slice(0, 8)}…${recipient.slice(-8)}`
    : recipient;

  return (
    <div style={{ fontFamily: FONT }}>
      <StepIndicator current={step} />

      {/* ── Recipient step ── */}
      {step === "recipient" && (
        <div>
          {/* Mode toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4, gap: 4, marginBottom: 20 }}>
            {(["address", "x"] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setRecipient(""); setAddrError(""); }} style={{
                flex: 1, padding: "8px 0", borderRadius: 9,
                border: "none",
                background: mode === m ? "rgba(125,113,211,0.18)" : "transparent",
                color: mode === m ? "#c4bdff" : "#555",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                transition: "all 0.2s",
              }}>
                {m === "address" ? "Wallet Address" : "X (Twitter) Handle"}
              </button>
            ))}
          </div>

          <label style={{ fontSize: 11, fontWeight: 600, color: "#666", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
            {mode === "address" ? "Recipient Address" : "X Handle"}
          </label>
          <div style={{ position: "relative", marginBottom: addrError ? 6 : 20 }}>
            <input
              value={recipient}
              onChange={e => { setRecipient(e.target.value); setAddrError(""); }}
              onKeyDown={e => e.key === "Enter" && handleRecipientNext()}
              placeholder={mode === "address" ? "Paste Solana wallet address…" : "@username"}
              style={{
                width: "100%", background: "#111", border: `1px solid ${addrError ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 12, padding: "13px 16px", color: "#fff", fontSize: 14,
                fontFamily: mode === "address" ? "monospace" : FONT,
                outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
              }}
            />
          </div>
          {addrError && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171", fontSize: 12, marginBottom: 14 }}>
              {IC.warning} {addrError}
            </div>
          )}

          <button onClick={handleRecipientNext} style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: "#161616",
            border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: FONT,
            boxShadow: "0 4px 24px rgba(125,113,211,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "opacity 0.2s",
          }}>
            Continue {IC.arrowRight}
          </button>
        </div>
      )}

      {/* ── Amount step ── */}
      {step === "amount" && (
        <div>
          {/* Recipient chip */}
          <div style={{ background: "rgba(125,113,211,0.08)", border: "1px solid rgba(125,113,211,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: "#666", fontWeight: 600 }}>TO</span>
            <span style={{ fontSize: 12, color: "#bbb", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortRecipient}</span>
            <button onClick={() => setStep("recipient")} style={{ background: "none", border: "none", cursor: "pointer", color: "#555", fontSize: 11, fontFamily: FONT }}>Edit</button>
          </div>

          <label style={{ fontSize: 11, fontWeight: 600, color: "#666", letterSpacing: 1, textTransform: "uppercase", display: "block", marginBottom: 8 }}>Amount</label>

          <div style={{ position: "relative", marginBottom: amtError ? 6 : 8 }}>
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setAmtError(""); }}
              onKeyDown={e => e.key === "Enter" && handleAmountNext()}
              placeholder="0.00"
              style={{
                width: "100%", background: "#111",
                border: `1px solid ${amtError ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 12, padding: "16px 100px 16px 16px",
                color: "#fff", fontSize: 24, fontWeight: 700,
                fontFamily: "monospace", outline: "none", boxSizing: "border-box",
              }}
            />
            <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>SOL</span>
              <button onClick={() => {
                if (balance !== null) setAmount(Math.max(0, balance - FEE_ESTIMATE).toFixed(6));
              }} style={{ background: "rgba(125,113,211,0.14)", border: "1px solid rgba(125,113,211,0.25)", borderRadius: 6, padding: "3px 9px", color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
                MAX
              </button>
            </div>
          </div>

          {amtError && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#f87171", fontSize: 12, marginBottom: 10 }}>
              {IC.warning} {amtError}
            </div>
          )}

          {/* Balance indicator */}
          <div style={{ fontSize: 12, color: "#444", marginBottom: 20 }}>
            Available: <span style={{ color: "#777", fontFamily: "monospace" }}>
              {balance !== null ? `${balance.toFixed(6)} SOL` : "…"}
            </span>
            <span style={{ color: "#333", marginLeft: 8 }}>· Est. fee ~0.000005 SOL</span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep("recipient")} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#666", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
              Back
            </button>
            <button onClick={handleAmountNext} style={{ flex: 2, padding: "13px", borderRadius: 12, background: "#161616", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              Review {IC.arrowRight}
            </button>
          </div>
        </div>
      )}

      {/* ── Review step ── */}
      {step === "review" && (
        <div>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px", marginBottom: 16 }}>
            {[
              { label: "From",      val: publicKey ? `${publicKey.slice(0,8)}…${publicKey.slice(-8)}` : "—", mono: true },
              { label: "To",        val: shortRecipient, mono: true },
              { label: "Amount",    val: `${amount} SOL`, mono: true },
              { label: "Network",   val: cluster === "devnet" ? "Devnet" : "Mainnet Beta", mono: false },
              { label: "Est. fee",  val: `~${FEE_ESTIMATE} SOL`, mono: true },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>{row.label}</span>
                <span style={{ fontSize: 12, color: "#ccc", fontFamily: row.mono ? "monospace" : FONT, textAlign: "right", maxWidth: "65%", wordBreak: "break-all" }}>{row.val}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
              <span style={{ fontSize: 12, color: "#888", fontWeight: 700 }}>Total sent</span>
              <span style={{ fontSize: 16, color: "#fff", fontFamily: "monospace", fontWeight: 800 }}>{(parseFloat(amount) + FEE_ESTIMATE).toFixed(6)} SOL</span>
            </div>
          </div>

          {sendError && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 14px", borderRadius: 10, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", fontSize: 12, marginBottom: 14 }}>
              {IC.warning} <span style={{ flex: 1 }}>{sendError}</span>
            </div>
          )}

          {cluster === "devnet" && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 12, color: "#fbbf24", marginBottom: 14 }}>
              ⚠️ You're on Devnet — SOL has no real monetary value.
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setStep("amount"); setSendError(""); }} style={{ flex: 1, padding: "13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", color: "#666", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
              Back
            </button>
            <button onClick={handleSend} disabled={sending} style={{
              flex: 2, padding: "13px", borderRadius: 12,
              background: sending ? "rgba(255,255,255,0.05)" : "#161616",
              border: sending ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: sending ? "not-allowed" : "pointer", fontFamily: FONT,
              boxShadow: sending ? "none" : "0 4px 24px rgba(125,113,211,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}>
              {sending ? "Sending…" : <>{IC.send} Confirm & Send</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Done step ── */}
      {step === "done" && (
        <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(74,222,128,0.12)", border: "1.5px solid rgba(74,222,128,0.35)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Transaction Sent!</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>
            {amount} SOL → {shortRecipient}
          </div>
          {txSig && (
            <a href={`https://solscan.io/tx/${txSig}${cluster === "devnet" ? "?cluster=devnet" : ""}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: ACCENT, textDecoration: "none", marginBottom: 20 }}>
              {IC.link} View on Solscan
            </a>
          )}
          <div>
            <button onClick={reset} style={{ padding: "12px 28px", borderRadius: 12, border: `1px solid rgba(125,113,211,0.3)`, background: "rgba(125,113,211,0.08)", color: ACCENT, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
              Send Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
