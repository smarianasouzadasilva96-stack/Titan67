import { Download, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

export function PWAInstallButton() {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();

  if (isInstalled || !canInstall) return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
    >
      <Download className="w-3.5 h-3.5 text-red-500" />
      <span>Instalar App</span>
    </button>
  );
}

export function OfflineIndicator() {
  const { isOnline } = usePWAInstall();

  if (isOnline) return null;

  return (
    <div className="px-3 py-1.5 bg-amber-950/70 border border-amber-700/60 text-amber-200 text-xs font-medium rounded-lg flex items-center gap-1.5 whitespace-nowrap">
      <WifiOff className="w-3.5 h-3.5 text-amber-400" />
      <span>Modo Offline</span>
    </div>
  );
}
