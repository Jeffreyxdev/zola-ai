import { useState, useCallback, useEffect, type ReactNode } from 'react';

import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { WalletReadyState, type WalletAdapter } from '@solana/wallet-adapter-base';
import { post } from '../lib/api';
import {
  WalletContext,
  type SupportedWalletName,
  type Cluster
} from './WalletContext';

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
  const [isConnecting, setIsConnecting] = useState(true); // Start true on mount to prevent race conditions
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

    // Auto-connect if wallet was previously connected
    const savedWallet = localStorage.getItem('zola_walletName') as SupportedWalletName | null;
    let autoConnectTimer: ReturnType<typeof setTimeout> | undefined;

    const performAutoConnect = async () => {
      if (!savedWallet) {
        setIsConnecting(false);
        return;
      }

      if (savedWallet === 'Magic Eden') {
        const checkME = setInterval(async () => {
          const provider = getMagicEdenProvider();
          if (provider) {
            clearInterval(checkME);
            clearTimeout(autoConnectTimer);
            try {
              const resp = await provider.connect();
              const pk = resp.publicKey.toString();
              setPublicKey(pk);
              setIsConnected(true);
              setWalletName('Magic Eden');
              setActiveAdapter(null);
            } catch {
              localStorage.removeItem('zola_walletName');
            } finally {
              setIsConnecting(false);
            }
          }
        }, 100);
        autoConnectTimer = setTimeout(() => {
          clearInterval(checkME);
          setIsConnecting(false);
        }, 1500);
      } else {
        const adapter = adapters[savedWallet];
        if (!adapter) {
          setIsConnecting(false);
          return;
        }

        const tryAdapterConnect = async () => {
          try {
            await adapter.connect();
            if (adapter.publicKey) {
              setPublicKey(adapter.publicKey.toString());
              setIsConnected(true);
              setWalletName(savedWallet);
              setActiveAdapter(adapter);
              adapter.once('disconnect', () => {
                setPublicKey(null);
                setIsConnected(false);
                setWalletName(null);
                setActiveAdapter(null);
                localStorage.removeItem('zola_walletName');
              });
            }
          } catch {
            localStorage.removeItem('zola_walletName');
          } finally {
            setIsConnecting(false);
          }
        };

        if (adapter.readyState === WalletReadyState.Installed || adapter.readyState === WalletReadyState.Loadable) {
          tryAdapterConnect();
        } else {
          const readyHandler = () => {
            if (adapter.readyState === WalletReadyState.Installed || adapter.readyState === WalletReadyState.Loadable) {
              adapter.off('readyStateChange', readyHandler);
              clearTimeout(autoConnectTimer);
              tryAdapterConnect();
            }
          };
          adapter.on('readyStateChange', readyHandler);
          autoConnectTimer = setTimeout(() => {
            adapter.off('readyStateChange', readyHandler);
            setIsConnecting(false);
          }, 1500);
        }
      }
    };

    performAutoConnect();

    return () => {
      if (autoConnectTimer) clearTimeout(autoConnectTimer);
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  const connect = useCallback(async (name: SupportedWalletName): Promise<boolean> => {
    setIsConnecting(true);
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
        localStorage.setItem('zola_walletName', 'Magic Eden');
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
        localStorage.removeItem('zola_walletName');
      });

      localStorage.setItem('zola_walletName', name);
      return true;
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'WalletConnectionError') {
        console.error(`Failed to connect ${name}:`, err);
      }
      return false;
    } finally {
      setIsConnecting(false);
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
      localStorage.removeItem('zola_walletName');
    }
  }, [walletName, activeAdapter]);

  return (
    <WalletContext.Provider value={{ publicKey, isConnected, isConnecting, walletName, readyStates, connect, disconnect, cluster, setCluster }}>
      {children}
    </WalletContext.Provider>
  );
};

export default SolanaWalletProvider;