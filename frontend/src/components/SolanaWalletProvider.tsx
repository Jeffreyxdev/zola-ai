import React, { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';

import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { WalletReadyState, type WalletAdapter } from '@solana/wallet-adapter-base';
import { post } from '../lib/api';

export type SupportedWalletName = 'Phantom' | 'Solflare' | 'Backpack' | 'Magic Eden';

export type Cluster = "mainnet-beta" | "devnet";

export interface WalletContextType {
  publicKey: string | null;
  isConnected: boolean;
  walletName: SupportedWalletName | null;
  readyStates: Record<SupportedWalletName, WalletReadyState>;
  connect: (name: SupportedWalletName) => Promise<boolean>;
  disconnect: () => Promise<void>;
  cluster: Cluster;
  setCluster: (c: Cluster) => void;
}

export const WalletContext = createContext<WalletContextType | null>(null);

// Instantiate adapters once (not inside render)
const adapters: Partial<Record<SupportedWalletName, WalletAdapter>> = {
  Phantom: new PhantomWalletAdapter(),
  Solflare: new SolflareWalletAdapter(),
  Backpack: new BackpackWalletAdapter(),
};

// Magic Eden uses window injection — no official adapter package yet
type MagicEdenProvider = { connect: () => Promise<{ publicKey: { toString: () => string } }>; disconnect: () => Promise<void> };
const getMagicEdenProvider = (): MagicEdenProvider | null => {
  const me = (window as unknown as { magicEden?: { solana?: MagicEdenProvider } }).magicEden;
  return me?.solana ?? null;
};

/** Tell the backend about a newly connected wallet on the given cluster */
async function registerWallet(wallet: string, cluster: string) {
  try {
    await post('/api/link-wallet', { wallet, cluster });
  } catch (e) {
    console.warn('[Zola] Failed to register wallet with backend:', e);
  }
}

export const SolanaWalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [walletName, setWalletName] = useState<SupportedWalletName | null>(null);
  const [activeAdapter, setActiveAdapter] = useState<WalletAdapter | null>(null);
  const [cluster, setCluster] = useState<Cluster>("mainnet-beta");
  const [readyStates, setReadyStates] = useState<Record<SupportedWalletName, WalletReadyState>>({
    Phantom: WalletReadyState.Unsupported,
    Solflare: WalletReadyState.Unsupported,
    Backpack: WalletReadyState.Unsupported,
    'Magic Eden': WalletReadyState.Unsupported,
  });

  // Poll ready states on mount (adapters detect extensions async)
  useEffect(() => {
    const update = () => {
      setReadyStates({
        Phantom: adapters.Phantom?.readyState ?? WalletReadyState.Unsupported,
        Solflare: adapters.Solflare?.readyState ?? WalletReadyState.Unsupported,
        Backpack: adapters.Backpack?.readyState ?? WalletReadyState.Unsupported,
        'Magic Eden': getMagicEdenProvider()
          ? WalletReadyState.Installed
          : WalletReadyState.NotDetected,
      });
    };

    update();
    const unsubs = Object.values(adapters).map((adapter) => {
      const handler = () => update();
      adapter.on('readyStateChange', handler);
      return () => adapter.off('readyStateChange', handler);
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const connect = useCallback(async (name: SupportedWalletName): Promise<boolean> => {
    try {
      // Magic Eden — window injection path
      if (name === 'Magic Eden') {
        const provider = getMagicEdenProvider();
        if (!provider) {
          window.open('https://magiceden.io/download', '_blank');
          return false;
        }
        const resp = await provider.connect();
        const pk = resp.publicKey.toString();
        setPublicKey(pk);
        setIsConnected(true);
        setWalletName('Magic Eden');
        setActiveAdapter(null);
        // ← Register with backend (include current cluster)
        await registerWallet(pk, cluster);
        return true;
      }

      // Standard adapter path
      const adapter = adapters[name];
      if (!adapter) return false;

      if (adapter.readyState === WalletReadyState.NotDetected ||
          adapter.readyState === WalletReadyState.Unsupported) {
        window.open(adapter.url, '_blank');
        return false;
      }

      // Disconnect previous adapter if switching wallets
      if (activeAdapter && activeAdapter !== adapter) {
        await activeAdapter.disconnect().catch(() => {});
      }

      await adapter.connect();

      if (!adapter.publicKey) return false;

      const pk = adapter.publicKey.toString();
      setPublicKey(pk);
      setIsConnected(true);
      setWalletName(name);
      setActiveAdapter(adapter);

      // ← Register with backend immediately after connect
      await registerWallet(pk, cluster);

      // Handle disconnect events from the wallet itself
      adapter.once('disconnect', () => {
        setPublicKey(null);
        setIsConnected(false);
        setWalletName(null);
        setActiveAdapter(null);
      });

      return true;
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'WalletConnectionError') {
        console.error(`Failed to connect ${name}:`, err);
      }
      return false;
    }
  }, [activeAdapter, cluster]);

  // ── Sync cluster toggle to backend whenever it changes ──────────────────
  useEffect(() => {
    if (!publicKey) return;
    import('../lib/api').then(({ API_BASE }) => {
      fetch(`${API_BASE}/api/cluster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: publicKey, cluster }),
      }).catch(() => { /* non-critical */ });
    });
  }, [cluster, publicKey]);

  const disconnect = useCallback(async () => {
    try {
      if (walletName === 'Magic Eden') {
        const provider = getMagicEdenProvider();
        await provider?.disconnect();
      } else if (activeAdapter) {
        await activeAdapter.disconnect();
      }
    } catch (err) {
      console.error('Disconnect error:', err);
    } finally {
      setPublicKey(null);
      setIsConnected(false);
      setWalletName(null);
      setActiveAdapter(null);
    }
  }, [walletName, activeAdapter]);

  return (
    <WalletContext.Provider value={{ publicKey, isConnected, walletName, readyStates, connect, disconnect, cluster, setCluster }}>
      {children}
    </WalletContext.Provider>
  );
};

export default SolanaWalletProvider;