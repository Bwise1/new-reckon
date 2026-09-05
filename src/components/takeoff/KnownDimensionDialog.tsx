import React, { useEffect, useRef, useState } from 'react';

interface KnownDimensionDialogProps {
  open: boolean;
  /** Total pages on the plan — an "apply to all" option shows when > 1. */
  pageCount?: number;
  onConfirm: (distance: number, applyToAll: boolean) => void;
  onCancel: () => void;
}

/**
 * Known-dimension calibration, step 1: the user types a measurement they can
 * see on the plan (a printed dimension, a door width) BEFORE drawing. After
 * confirming, they trace that dimension on the plan and the scale is set
 * automatically — no second dialog.
 */
const KnownDimensionDialog: React.FC<KnownDimensionDialogProps> = ({
  open,
  pageCount = 1,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue('');
      setError(null);
      setApplyToAll(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const parsed = parseFloat(value);
    if (!isFinite(parsed) || isNaN(parsed) || parsed <= 0) {
      setError('Enter a positive number');
      return;
    }
    onConfirm(parsed, applyToAll);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
        <h2 className="text-base font-semibold text-body">Known dimension</h2>
        <p className="mt-1 text-xs text-muted">
          Enter a real-world measurement you can identify on the plan (a printed
          dimension line, a standard door). Next, you will draw that exact
          distance on the plan and the scale is set automatically.
        </p>

        <div className="mt-4 flex items-stretch rounded-md border border-border overflow-hidden focus-within:ring-2 focus-within:ring-accent/30">
          <input
            ref={inputRef}
            type="number"
            min="0.001"
            step="0.01"
            value={value}
            placeholder="e.g. 3.6"
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onCancel();
            }}
            className="flex-1 px-3 py-2 text-sm outline-none"
          />
          <span className="px-3 flex items-center text-xs text-muted bg-surface-muted border-l border-border">
            m
          </span>
        </div>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}

        {pageCount > 1 && (
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2.5">
            <span className="text-xs font-medium text-body">
              Apply to all {pageCount} pages
              <span className="block text-[11px] font-normal text-muted">
                Otherwise this scale only applies to the current page.
              </span>
            </span>
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-accent"
            />
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-muted hover:bg-overlay/10 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-1.5 rounded-md bg-warn text-white text-sm font-semibold hover:bg-warn-strong cursor-pointer"
          >
            Start drawing
          </button>
        </div>
      </div>
    </div>
  );
};

export default KnownDimensionDialog;
