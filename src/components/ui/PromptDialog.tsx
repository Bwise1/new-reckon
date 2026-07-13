import React, { useEffect, useRef, useState } from 'react';

export type PromptVariant = 'danger' | 'primary';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  /** Optional descriptive text shown above the input. */
  message?: React.ReactNode;
  /** Label displayed above the input field. */
  label?: string;
  placeholder?: string;
  /** Prefilled value; user can accept or edit. */
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: PromptVariant;
  /** Client-side validation. Return `null` for OK or an error string to show. */
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

const VARIANT_CLASSES: Record<PromptVariant, string> = {
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  primary: 'bg-[#f97316] hover:bg-[#ea580c] text-white',
};

const PromptDialog: React.FC<PromptDialogProps> = ({
  open,
  title,
  message,
  label,
  placeholder,
  defaultValue = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  validate,
  onConfirm,
  onCancel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
      setPending(false);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, defaultValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const submit = async () => {
    if (pending) return;
    const trimmed = value.trim();
    if (validate) {
      const problem = validate(trimmed);
      if (problem) {
        setError(problem);
        return;
      }
    } else if (!trimmed) {
      setError('This field is required.');
      return;
    }
    setPending(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {message && (
          <div className="mt-1 text-sm text-gray-600">{message}</div>
        )}

        <div className="mt-4">
          {label && (
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {label}
            </label>
          )}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={placeholder}
            className={`w-full px-3 py-2 text-sm border rounded-md outline-none transition-colors ${
              error
                ? 'border-red-400 focus:ring-2 focus:ring-red-100'
                : 'border-gray-300 focus:ring-2 focus:ring-[#f97316]/25 focus:border-[#f97316]'
            }`}
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={`px-3 py-1.5 text-sm rounded-md font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]}`}
          >
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptDialog;
