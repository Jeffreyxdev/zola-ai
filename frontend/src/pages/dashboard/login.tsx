

interface LoginModalProps {
  onClose: () => void;
}

export default function LoginModal({ onClose }: LoginModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-60">
      <div className="bg-[#050505] rounded-2xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          ✕
        </button>
        <h2 className="text-xl font-semibold mb-4 text-white">Connect a Wallet</h2>
        <div className="space-y-3">
          {[
            "Rainbow",
            "Coinbase Wallet",
            "MetaMask",
            "WalletConnect",
            "Argent",
            "Trust",
            "Ledger Live",
            "imWallet",
          ].map((name) => (
            <div
              key={name}
              className="flex items-center justify-between p-3 bg-white/10 rounded-lg cursor-pointer hover:bg-white/20 transition"
            >
              <span className="text-white font-medium">{name}</span>
              {/* placeholder for icon */}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
