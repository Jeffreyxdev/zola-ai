import { useState, useContext, useEffect } from "react";
import { Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import { WalletContext } from "@/components/WalletContext";
import { adminApi } from "../../lib/api";
import { LayoutDashboard, Users, CircleDollarSign, ArrowRightLeft, Shield, Settings, Menu, X } from "lucide-react";
import AdminDashboard  from "./AdminDashboard";
import AdminUsers      from "./AdminUsers";
import AdminRevenue    from "./AdminRevenue";
import AdminSwaps      from "./AdminSwaps";
import AdminTeam       from "./AdminTeam";
import AdminSettings   from "./AdminSettings";
import AdminUserDetail from "./AdminUserDetail";

const ACCENT = "#7D71D3";
const FONT = "'Inter', 'SF Pro Display', sans-serif";

const NAV = [
  { path: "",        label: "Dashboard",  icon: <LayoutDashboard size={18} /> },
  { path: "users",   label: "Users",      icon: <Users size={18} /> },
  { path: "revenue", label: "Revenue",    icon: <CircleDollarSign size={18} /> },
  { path: "swaps",   label: "Swaps",      icon: <ArrowRightLeft size={18} /> },
  { path: "team",    label: "Team",       icon: <Shield size={18} /> },
  { path: "settings",label: "Settings",   icon: <Settings size={18} /> },
];

export default function AdminLayout() {
  const ctx          = useContext(WalletContext);
  const wallet       = ctx?.publicKey ?? null;
  const isConnecting = ctx?.isConnecting ?? true;
  const navigate     = useNavigate();
  const location     = useLocation();

  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [adminRole,  setAdminRole]  = useState<string>("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    console.log("[AdminLayout] Check stats:", { wallet, isConnecting });
    if (isConnecting) return;
    if (!wallet) {
      console.log("[AdminLayout] No wallet, redirecting to /");
      navigate("/", { replace: true });
      return;
    }
    adminApi<{ role: string; wallet: string }>("/admin/stats", wallet)
      .then(r => {
        console.log("[AdminLayout] Stats response:", r);
        setAuthorized(true);
        setAdminRole((r as unknown as { role?: string }).role ?? "viewer");
      })
      .catch((err) => {
        console.error("[AdminLayout] Stats error:", err);
        setAuthorized(false);
      });
  }, [wallet, isConnecting, navigate]);

  // Also check actual role from team endpoint
  useEffect(() => {
    if (isConnecting || !wallet) return;
    adminApi<{ team: { wallet: string; role: string }[] }>("/admin/team", wallet)
      .then(r => {
        const me = r.team?.find(t => t.wallet === wallet);
        if (me) setAdminRole(me.role);
      })
      .catch(() => {});
  }, [wallet, isConnecting]);

  console.log("[AdminLayout] Render:", { isConnecting, authorized, wallet });
  if (isConnecting || authorized === null) return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#555" }}>
      Checking admin access…
    </div>
  );

  if (!authorized) {
    console.log("[AdminLayout] Not authorized, redirecting to /");
    navigate("/", { replace: true });
    return null;
  }

  if (!authorized) return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
      <h2 style={{ color: "#fff", fontWeight: 700, marginBottom: 8 }}>Not Authorized</h2>
      <p style={{ color: "#555", fontSize: 13, marginBottom: 20 }}>Your wallet does not have admin access.</p>
      <Link to="/dashboard" style={{ color: ACCENT, fontSize: 13 }}>← Back to Dashboard</Link>
    </div>
  );

  const currentPath = location.pathname.replace("/admin", "").replace(/^\//, "").split("/")[0];

  return (
    <>
      <style>{`
        .admin-layout-container {
          display: flex;
          min-height: 100vh;
          background: #080808;
          font-family: ${FONT};
          color: #fff;
          flex-direction: row;
        }
        .admin-sidebar {
          width: 200px;
          min-height: 100vh;
          background: #0b0b0d;
          border-right: 1px solid rgba(255,255,255,0.06);
          display: flex;
          flex-direction: column;
          padding: 24px 10px;
          flex-shrink: 0;
          transition: transform 0.3s ease;
        }
        .admin-main {
          flex: 1;
          padding: 32px 36px;
          overflow-y: auto;
          width: 100%;
        }
        .admin-hamburger {
          display: none;
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 100;
          background: #111;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 8px;
          color: #fff;
          cursor: pointer;
        }
        .admin-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 40;
          backdrop-filter: blur(2px);
        }
        @media (max-width: 768px) {
          .admin-layout-container {
            flex-direction: column;
          }
          .admin-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            z-index: 50;
            transform: translateX(-100%);
          }
          .admin-sidebar.open {
            transform: translateX(0);
          }
          .admin-main {
            padding: 64px 16px 24px 16px; 
          }
          .admin-hamburger {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .admin-overlay.open {
            display: block;
          }
        }
      `}</style>
      
      <div className="admin-layout-container">
        <button className="admin-hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div 
          className={`admin-overlay ${mobileMenuOpen ? "open" : ""}`} 
          onClick={() => setMobileMenuOpen(false)} 
        />

        {/* Sidebar */}
        <aside className={`admin-sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div style={{ padding: "0 6px", marginBottom: 28 }}>
          <Link to="/dashboard" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>
              zola <span style={{ color: ACCENT }}>admin</span>
            </span>
          </Link>
          <div style={{ fontSize: 10, color: "#333", marginTop: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{adminRole || "viewer"}</div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {NAV.map(item => {
            const active = currentPath === item.path || (item.path === "" && currentPath === "");
            return (
              <Link
                key={item.path}
                to={`/admin${item.path ? "/" + item.path : ""}`}
                id={`admin-nav-${item.path || "dashboard"}`}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 10px", borderRadius: 9, textDecoration: "none",
                  background: active ? "rgba(125,113,211,0.14)" : "transparent",
                  color: active ? ACCENT : "#555",
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  borderLeft: active ? `2px solid ${ACCENT}` : "2px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: "8px 6px", borderTop: "1px solid rgba(255,255,255,0.05)", marginTop: 8 }}>
          <Link to="/dashboard" style={{ fontSize: 11, color: "#444", textDecoration: "none" }}>← App Dashboard</Link>
        </div>
      </aside>

      {/* Main */}
      <main className="admin-main">
        <Routes>
          <Route path="/"        element={<AdminDashboard wallet={wallet!} />} />
          <Route path="users"    element={<AdminUsers wallet={wallet!} />} />
          <Route path="users/:w" element={<AdminUserDetail wallet={wallet!} />} />
          <Route path="revenue"  element={<AdminRevenue wallet={wallet!} />} />
          <Route path="swaps"    element={<AdminSwaps wallet={wallet!} />} />
          <Route path="team"     element={<AdminTeam wallet={wallet!} adminRole={adminRole} />} />
          <Route path="settings" element={<AdminSettings wallet={wallet!} />} />
        </Routes>
      </main>
    </div>
    </>
  );
}
