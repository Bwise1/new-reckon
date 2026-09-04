import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTheme } from '@/hooks/useProjectTheme';
import { STORAGE_PACK_GB, STORAGE_PACK_MONTHLY } from '@/lib/workspace-settings';

type Props = { open: boolean; currentAddonGb: number; onClose: () => void; onConfirm: () => void };

/** Buy an add-on storage pack — demo only. Ported from the prototype. */
export default function BuyStorageModal({ open, currentAddonGb, onClose, onConfirm }: Props) {
  const { theme } = useTheme();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const nextAddon = currentAddonGb + STORAGE_PACK_GB;

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Buy more storage"
        className="w-full max-w-md rounded-xl border border-border bg-surface text-body shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-body">Buy more storage</h2>
          <button type="button" aria-label="Close" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-lg border border-border bg-surface-muted/50 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-body">+{STORAGE_PACK_GB} GB storage pack</span>
              <span className="text-sm font-semibold tabular-nums text-body">
                ₦{STORAGE_PACK_MONTHLY.toLocaleString('en-US')}
                <span className="text-xs font-normal text-muted"> / mo</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-muted">
              Stacks on top of your plan limit. Add-on total after this purchase:{' '}
              <span className="font-medium text-body">{nextAddon} GB</span>.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-xs">
            <span className="text-muted">Payment method</span>
            <span className="font-medium text-body">Not set up yet</span>
          </div>

          <p className="text-[11px] leading-relaxed text-muted">
            Payments are not live yet. This records your choice locally; no card is charged.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body">
            Cancel
          </button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">
            Add {STORAGE_PACK_GB} GB
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
