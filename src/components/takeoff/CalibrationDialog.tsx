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

  useEffect(() => {
    if (open) {
      setValue('');
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
        <h2 className="text-base font-semibold text-gray-900">Set calibration distance</h2>
        <p className="mt-1 text-xs text-gray-500">
          Line length: {pixelDistance.toFixed(1)} px. Enter the real-world distance this line represents.
        </p>

        <div className="mt-4 flex items-stretch rounded-md border border-gray-300 overflow-hidden focus-within:ring-2 focus-within:ring-orange-200">
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
                onCancel();
              }
            }}
            placeholder="e.g. 2.5"
            className="flex-1 px-3 py-2 text-sm outline-none"
          />
          <span className="px-3 py-2 bg-gray-50 text-sm text-gray-600 border-l border-gray-300">
            m
          </span>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="px-3 py-1.5 text-sm rounded-md bg-[#f97316] text-white hover:bg-[#ea580c] font-semibold"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationDialog;
