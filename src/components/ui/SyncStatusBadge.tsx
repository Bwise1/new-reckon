import { FiCheck, FiLoader, FiWifiOff } from 'react-icons/fi';
import { useSyncStatus } from '@/hooks/useSyncStatus';

const SyncStatusBadge = () => {
  const { isOnline, pendingCount } = useSyncStatus();

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-danger/30 text-sm">
        <FiWifiOff className="w-4 h-4 text-danger" />
        <span className="text-muted">
          Offline{pendingCount > 0 ? ` — ${pendingCount} pending` : ''}
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-warn/30 text-sm">
        <FiLoader className="w-4 h-4 text-warn animate-spin" />
        <span className="text-muted">Syncing… ({pendingCount})</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-lg border border-border text-sm">
      <FiCheck className="w-4 h-4 text-accent" />
      <span className="text-muted">Synced</span>
    </div>
  );
};

export default SyncStatusBadge;
