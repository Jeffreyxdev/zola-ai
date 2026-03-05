export type NavItem =
  | "wallet"
  | "terminal"
  | "send"
  | "receive"
  | "history"
  | "activity"
  | "accounts"
  | "notifications"
  | "settings";

export interface Token {
  symbol: string;
  name: string;
  balance: string;
  usd: string;
  change: string;
}

export interface Transaction {
  name: string;
  date: string;
  amount: string;
  usd: string;
  type: string;
  hash: string;
  positive: boolean;
}
