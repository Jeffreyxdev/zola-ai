import { useContext } from "react";
import { WalletContext, type Cluster } from "../../../components/SolanaWalletProvider";
import { IC, FONT } from "../icons";

const ENDPOINTS: Record<string, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet:         "https://api.devnet.solana.com",
};

export function Settings() {
  const ctx     = useContext(WalletContext);
  const cluster: Cluster = ctx?.cluster     ?? "mainnet-beta";
  const setCl             = ctx?.setCluster;

  const isDevnet = cluster === "devnet";

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Settings</div>

      {/* Network section */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          {IC.network}
          <span style={{ fontSize: 13, fontWeight: 700, color: "#ddd" }}>Network</span>
        </div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>
          Switch between Mainnet and Devnet. Devnet SOL has no real monetary value.
        </div>

        {/* Toggle row */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4, gap: 4, marginBottom: 16 }}>
          {(["mainnet-beta", "devnet"] as const).map(net => (
            <button key={net} onClick={() => setCl?.(net)} style={{
              flex: 1, padding: "10px 0", borderRadius: 9,
              border: "none",
              background: cluster === net ? (net === "devnet" ? "rgba(251,191,36,0.15)" : "rgba(125,113,211,0.18)") : "transparent",
              color: cluster === net ? (net === "devnet" ? "#fbbf24" : "#c4bdff") : "#555",
              fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              transition: "all 0.2s",
            }}>
              {net === "mainnet-beta" ? "Mainnet Beta" : "Devnet"}
            </button>
          ))}
        </div>

        {/* Current endpoint */}
        <div style={{ background: "#0a0a0a", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: isDevnet ? "#fbbf24" : "#4ade80", boxShadow: isDevnet ? "0 0 6px #fbbf24" : "0 0 6px #4ade80", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#888", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ENDPOINTS[cluster]}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: isDevnet ? "#fbbf24" : "#4ade80", letterSpacing: 1, textTransform: "uppercase" }}>
            {isDevnet ? "Devnet" : "Live"}
          </span>
        </div>

        {isDevnet && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", fontSize: 12, color: "#fbbf24" }}>
            ⚠️ You're on Devnet. Transactions and balances are for testing only.
          </div>
        )}
      </div>

      {/* App info */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: "20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#ddd", marginBottom: 14 }}>About</div>
        {[
          { label: "Version",  val: "0.1.0 (beta)" },
          { label: "Network",  val: cluster === "devnet" ? "Solana Devnet" : "Solana Mainnet Beta" },
        ].map(row => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 12, color: "#555" }}>{row.label}</span>
            <span style={{ fontSize: 12, color: "#888" }}>{row.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
