import { FiCheck, FiLoader, FiWifiOff } from 'react-icons/fi';
import { useSyncStatus } from '@/hooks/useSyncStatus';

const SyncStatusBadge = () => {
  const { isOnline, pendingCount } = useSyncStatus();

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-red-200 text-sm">
        <FiWifiOff className="w-4 h-4 text-red-500" />
        <span className="text-gray-600">
          Offline{pendingCount > 0 ? ` — ${pendingCount} pending` : ''}
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-amber-200 text-sm">
        <FiLoader className="w-4 h-4 text-amber-500 animate-spin" />
        <span className="text-gray-600">Syncing… ({pendingCount})</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-sm">
      <FiCheck className="w-4 h-4 text-green-500" />
      <span className="text-gray-600">Synced</span>
    </div>
  );
};

export default SyncStatusBadge;
