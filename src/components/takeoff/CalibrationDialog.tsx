import React, { useEffect, useRef, useState } from 'react';

interface CalibrationDialogProps {
  open: boolean;
  pixelDistance: number;
  onConfirm: (distance: number) => void;
  onCancel: () => void;
}

const CalibrationDialog: React.FC<CalibrationDialogProps> = ({
  open,
  pixelDistance,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset during render on the open transition rather than in an effect, which
  // would paint the previous value for one frame first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setValue('');
      setError(null);
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
    onConfirm(parsed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/40">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
        <h2 className="text-base font-semibold text-body">Set calibration distance</h2>
        <p className="mt-1 text-xs text-muted">
          Line length: {pixelDistance.toFixed(1)} px. Enter the real-world distance this line represents.
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
            className="flex-1 px-3 py-2 text-sm outline-none"
          />
          <span className="px-3 py-2 bg-surface-muted text-sm text-muted border-l border-border">
            m
          </span>
        </div>

        {error && <p className="mt-2 text-xs text-danger">{error}</p>}

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
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationDialog;
