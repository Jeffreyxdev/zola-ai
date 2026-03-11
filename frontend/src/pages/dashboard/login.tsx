import { useContext, useState } from 'react';
import { WalletContext, type SupportedWalletName } from '@/components/WalletContext';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import magic from "@/assets/logo/magic.png"
import { useNavigate } from 'react-router-dom';
interface LoginModalProps {
  onClose: () => void;
}

const wallets: { name: SupportedWalletName; icon: string }[] = [
  { name: 'Phantom',    icon: new PhantomWalletAdapter().icon },
  { name: 'Solflare',  icon: new SolflareWalletAdapter().icon },
  { name: 'Backpack',  icon: new BackpackWalletAdapter().icon },
  // Magic Eden has no adapter package — use their hosted logo
  { name: 'Magic Eden', icon: magic},
];

const readyLabel: Record<WalletReadyState, string> = {
  [WalletReadyState.Installed]: 'Detected',
  [WalletReadyState.Loadable]: 'Detected',
  [WalletReadyState.NotDetected]: 'Not installed',
  [WalletReadyState.Unsupported]: 'Not installed',
};

export default function LoginModal({ onClose }: LoginModalProps) {
  const walletContext = useContext(WalletContext);
  const navigate = useNavigate();
  const [connecting, setConnecting] = useState<SupportedWalletName | null>(null);

  if (!walletContext) return null;

  const { connect, readyStates } = walletContext;

const handleConnect = async (name: SupportedWalletName) => {
    setConnecting(name);
    try {
      const success = await connect(name);
      if (success) {
        onClose();
        navigate('/dashboard'); // ← redirect here
      }
    } finally {
      setConnecting(null);
    }
  };

  const isInstalled = (name: SupportedWalletName) =>
    readyStates[name] === WalletReadyState.Installed ||
    readyStates[name] === WalletReadyState.Loadable;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-60">
      <div className="bg-[#050505] rounded-2xl w-full max-w-md p-8 relative border border-white/10">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition"
        >
          ✕
        </button>

        <h2 className="text-2xl font-semibold mb-2 text-white">Connect a Wallet</h2>
        <p className="text-gray-400 text-sm mb-6">Choose your preferred Solana wallet</p>

        <div className="space-y-3">
          {wallets.map(({ name, icon }) => {
            const isConnecting = connecting === name;
            const detected = isInstalled(name);
            const state = readyStates[name];

            return (
              <button
                key={name}
                onClick={() => handleConnect(name as SupportedWalletName)}
                disabled={!!connecting}
                className="w-full flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 hover:border-white/20 transition cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <img
                  src={icon}
                  alt={name}
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
                <span className="text-white font-medium group-hover:text-gray-200 transition">
                  {name}
                </span>
                <span className={`ml-auto text-xs ${detected ? 'text-green-400' : 'text-gray-500'}`}>
                  {isConnecting
                    ? 'Connecting…'
                    : detected
                    ? '● Detected'
                    : readyLabel[state]}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-gray-500 text-xs mt-6 text-center">
          Don't have a wallet? Clicking an uninstalled wallet will open its download page.
        </p>
      </div>
    </div>
  );
}