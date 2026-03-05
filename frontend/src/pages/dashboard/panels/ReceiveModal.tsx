import { useState } from "react";
import { IC, FONT, ACCENT } from "../icons";

export function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&bgcolor=0d0d0d&color=7D71D3&margin=12`;

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#0d0d0d", border: `1px solid rgba(125,113,211,0.3)`, borderRadius: 20, padding: "32px 28px", width: "100%", maxWidth: 360, position: "relative", textAlign: "center", boxShadow: `0 0 60px rgba(125,113,211,0.15)`, fontFamily: FONT }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#888", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {IC.close}
        </button>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: ACCENT, textTransform: "uppercase", marginBottom: 6 }}>Receive SOL</div>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>Scan or share your wallet address</p>
        <div style={{ display: "inline-flex", padding: 12, background: "#111", borderRadius: 16, border: `1px solid rgba(125,113,211,0.2)`, marginBottom: 20 }}>
          <img src={qrUrl} alt="QR" width={180} height={180} style={{ borderRadius: 8, display: "block" }} />
        </div>
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: "#aaa", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{address}</span>
          <button onClick={copy} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#4ade80" : ACCENT, display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", fontFamily: FONT }}>
            {copied ? IC.check : IC.copy}{copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
