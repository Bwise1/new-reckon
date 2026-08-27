import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pipette } from 'lucide-react';

/** Prototype palette (Reckon-Bill ColorPicker) — 10 presets + custom. */
const PRESET_COLORS = [
  '#111827',
  '#EF4444',
  '#F59E0B',
  '#EAB308',
  '#10B981',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#78716C',
];

type Props = {
  value: string;
  onChange: (color: string) => void;
  /** Theme scope for the portalled popover. */
  portalTheme: string;
};

/**
 * Markup color control (Reckon-Bill prototype): toolbar swatch trigger that
 * opens a portalled popover with a 5-column preset grid and a native custom
 * picker behind a Pipette row.
 */
export default function MarkupColorPicker({ value, onChange, portalTheme }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: rect.bottom + 8,
        left: Math.min(rect.left, window.innerWidth - 160 - 8),
      });
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Markup color"
        title="Markup color"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex flex-col items-center gap-[2px] rounded-lg px-1 py-0.5 cursor-pointer"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-overlay/10 transition-colors">
          <span
            className="h-3.5 w-3.5 rounded-sm ring-1 ring-inset ring-overlay/15"
            style={{ backgroundColor: value }}
          />
        </span>
        <span className="whitespace-nowrap text-[9.5px] font-medium leading-none text-muted">
          Color
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            data-theme={portalTheme}
            style={{ position: 'fixed', top: position.top, left: position.left, zIndex: 99999 }}
            className="w-40 rounded-lg border border-border bg-surface p-2.5 shadow-lg"
          >
            <div className="grid grid-cols-5 gap-1.5">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  aria-label={presetColor}
                  onClick={() => {
                    onChange(presetColor);
                    setOpen(false);
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-md ring-1 ring-inset ring-overlay/15 transition-transform hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: presetColor }}
                >
                  {value.toLowerCase() === presetColor.toLowerCase() && (
                    <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />
                  )}
                </button>
              ))}
            </div>

            <label className="mt-2 flex h-8 cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-2 text-[10.5px] font-medium text-muted transition-colors hover:bg-overlay/10">
              <Pipette className="h-3.5 w-3.5 shrink-0" />
              Custom
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="sr-only"
              />
            </label>
          </div>,
          document.body
        )}
    </>
  );
}
