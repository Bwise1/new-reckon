import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { CALIBRATION_UNITS, toMetres, type CalibrationUnit } from '@/utils/calibrationUnits';

interface CalibrationDialogProps {
  open: boolean;
  /** Total pages on the plan — an "apply to all" option shows when > 1. */
  pageCount?: number;
  /** Label of the current page, shown in the apply-to-all hint. */
  pageLabel?: string;
  /** distanceMetres is already unit-converted; applyToAll copies it to every page. */
  onConfirm: (distanceMetres: number, applyToAll: boolean) => void;
  onCancel: () => void;
}

/**
 * The calibration modal, matching the YemiKrist prototype: opened from the
 * Calibrate tool, the user enters the real-world length of a reference (with a
 * unit) and optionally applies the scale to all pages, then draws that
 * reference on the plan to set the scale. The value converts to metres before
 * it leaves this dialog, so the rest of the app stays metric.
 */
const CalibrationDialog: React.FC<CalibrationDialogProps> = ({
  open,
  pageCount = 1,
  pageLabel,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState<CalibrationUnit>('m');
  const [error, setError] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset during render on the open transition rather than in an effect, which
  // would paint the previous value for one frame first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue('');
      setUnit('m');
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
    onConfirm(toMetres(parsed, unit), applyToAll);
  };

  const isValid = value.trim() !== '' && parseFloat(value) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40 px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-body">Calibrate Scale</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <p className="text-sm text-muted">
            Enter the real-world length of a known reference on this drawing to set its scale.
          </p>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted">
              Known Dimension
            </label>
            <div className="mt-2 flex gap-2">
              <input
                ref={inputRef}
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCancel();
                  }
                }}
                placeholder="e.g. 5"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as CalibrationUnit)}
                aria-label="Unit"
                className="rounded-lg border border-border bg-surface px-2 py-2 text-sm text-body outline-none cursor-pointer focus:border-accent focus:ring-2 focus:ring-accent/20 transition"
              >
                {CALIBRATION_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
          </div>

          {pageCount > 1 && (
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-3 py-2.5">
              <span className="text-xs font-medium text-body">
                Apply to all {pageCount} pages
                <span className="block text-[11px] font-normal text-muted">
                  Otherwise this scale only applies to{pageLabel ? ` “${pageLabel}”` : ' the current page'}
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
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!isValid}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:bg-accent-strong disabled:opacity-40 disabled:hover:bg-accent"
          >
            Set Scale
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationDialog;
