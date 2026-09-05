import React, { useEffect, useRef, useState } from 'react';
import { CALIBRATION_UNITS, toMetres, type CalibrationUnit } from '@/utils/calibrationUnits';

interface CalibrationDialogProps {
  open: boolean;
  pixelDistance: number;
  /** Total pages on the plan — an "apply to all" option shows when > 1. */
  pageCount?: number;
  /** distanceMetres is already unit-converted; applyToAll copies it to every page. */
  onConfirm: (distanceMetres: number, applyToAll: boolean) => void;
  onCancel: () => void;
}

/**
 * The single calibration modal: after drawing a reference line, enter its
 * real-world length, pick a unit, and optionally apply the scale to every
 * page. The value is converted to metres before it leaves this dialog, so the
 * rest of the app stays metric.
 */
const CalibrationDialog: React.FC<CalibrationDialogProps> = ({
  open,
  pixelDistance,
  pageCount = 1,
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

  // Focusing is a DOM side effect, so it stays in an effect.
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
        <h2 className="text-base font-semibold text-body">Set scale</h2>
        <p className="mt-1 text-xs text-muted">
          Line length: {pixelDistance.toFixed(1)} px. Enter the real-world distance this line
          represents.
        </p>

        <div className="mt-4 flex items-stretch rounded-md border border-border overflow-hidden focus-within:ring-2 focus-within:ring-accent/30">
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
            placeholder="e.g. 2.5"
            className="flex-1 px-3 py-2 text-sm outline-none bg-transparent text-body"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as CalibrationUnit)}
            aria-label="Unit"
            className="px-2 bg-surface-muted text-sm text-body border-l border-border outline-none cursor-pointer"
          >
            {CALIBRATION_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

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

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-body hover:bg-overlay/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-3 py-1.5 text-sm rounded-md bg-accent text-accent-fg hover:bg-accent-strong font-semibold"
          >
            Set Scale
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationDialog;
