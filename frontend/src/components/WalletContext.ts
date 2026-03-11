import { createContext } from 'react';
import { WalletReadyState } from '@solana/wallet-adapter-base';

export type SupportedWalletName = 'Phantom' | 'Solflare' | 'Backpack' | 'Magic Eden';
export type Cluster = "mainnet-beta" | "devnet";

export interface WalletContextType {
  publicKey: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  walletName: SupportedWalletName | null;
  readyStates: Record<SupportedWalletName, WalletReadyState>;
  connect: (name: SupportedWalletName) => Promise<boolean>;
  disconnect: () => Promise<void>;
  cluster: Cluster;
  setCluster: (c: Cluster) => void;
}

export const WalletContext = createContext<WalletContextType | null>(null);
