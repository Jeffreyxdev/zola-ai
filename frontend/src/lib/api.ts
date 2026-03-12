/**
 * Zola AI — centralised API/WS helper
 */
export const API_BASE =
  import.meta.env.VITE_API_URL as string ?? "http://localhost:8000";

export const WS_BASE =
  import.meta.env.VITE_WS_URL as string ?? "ws://localhost:8000";

/** Solana RPC URL helper */
export function getSolanaRpcUrl(cluster: string = "mainnet-beta") {
  if (cluster === "devnet") return "https://api.devnet.solana.com";
  const url = (import.meta.env.VITE_RPC_URL as string) || "https://api.mainnet-beta.solana.com";
  if (!import.meta.env.VITE_RPC_URL) {
    // occasionally the stock mainnet API has an expired cert; warning makes
    // it easier to diagnose from the console when fetching balance fails.
    console.warn(
      "Using default Solana RPC URL, consider setting VITE_RPC_URL to a healthy endpoint"
    );
  }
  return url;
}

/** Typed fetch wrapper */
export async function api<T = unknown>(
  path: string,
  opts?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Post helper */
export function post<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

/** Delete helper */
export function del<T = unknown>(path: string): Promise<T> {
  return api<T>(path, { method: "DELETE" });
}

/** Admin request helper — appends wallet as query param */
export function adminApi<T = unknown>(path: string, wallet: string, opts?: RequestInit): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  return api<T>(`${path}${sep}wallet=${encodeURIComponent(wallet)}`, opts);
}

export function adminPost<T = unknown>(path: string, wallet: string, body: unknown): Promise<T> {
  return adminApi<T>(path, wallet, { method: "POST", body: JSON.stringify(body) });
}

export function adminDel<T = unknown>(path: string, wallet: string): Promise<T> {
  return adminApi<T>(path, wallet, { method: "DELETE" });
}

// --------------------------------------------------------------------------- //
// Interfaces
// --------------------------------------------------------------------------- //
export interface ZolaStatus {
  wallet: string;
  registered: boolean;
  telegram: boolean;
  twitter: boolean;
  twitter_handle?: string;
  cluster?: string;
}

export interface ZolaSubscription {
  wallet: string;
  plan: "free" | "pro";
  expires_at: string | null;
  auto_renew: number;
  payment_token: "SOL" | "USDC";
  started_at?: string;
}

export interface SubscribeQuote {
  amount: number;
  recipient: string;
  token: "SOL" | "USDC";
  usdc_mint: string;
  expires_at: string;
  price_usd: number;
  sol_price: number;
  blockhash?: string;
}

export interface AdminStats {
  total_users: number;
  pro_users: number;
  free_users: number;
  total_volume_usd: number;
  total_fee_revenue_usd: number;
  total_pro_revenue_usd: number;
  telegram_linked: number;
  twitter_linked: number;
  swaps_today: number;
  swaps_this_month: number;
  active_dca_tasks: number;
  chart_history: { day: string; swaps: number; revenue: number }[];
}

export interface AdminUser {
  wallet: string;
  plan: string;
  tg_linked: number;
  tw_linked: number;
  cluster: string;
  created_at: string;
  expires_at: string | null;
  last_swap: string | null;
  total_volume: number;
}

export interface AdminRevenue {
  today: number;
  this_week: number;
  this_month: number;
  all_time: number;
  by_token: { SOL: number; USDC: number };
  fee_revenue: number;
  subscription_revenue: number;
  chart_data: { day: string; revenue: number }[];
}

export interface ProAnalytics {
  wallet: string;
  sol_balance: number;
  balance_usd: number;
  total_volume_usd: number;
  pnl_usd: number;
  pnl_percent: number;
  top_tokens: { token: string; value_usd: number }[];
  swap_history: unknown[];
  ai_recommendation: string;
  tx_count: number;
}
