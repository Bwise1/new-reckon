import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, RotateCw } from 'lucide-react';

export type RotateDirection = 'left' | 'right';
export type RotateScope = 'page' | 'all';

type Option = {
  direction: RotateDirection;
  scope: RotateScope;
  label: string;
  hint: string;
};

const OPTIONS: Option[] = [
  { direction: 'left', scope: 'page', label: 'Rotate Left', hint: 'Current page' },
  { direction: 'right', scope: 'page', label: 'Rotate Right', hint: 'Current page' },
  { direction: 'left', scope: 'all', label: 'Batch Rotate Left', hint: 'All pages' },
  { direction: 'right', scope: 'all', label: 'Batch Rotate Right', hint: 'All pages' },
];

const MENU_WIDTH = 220;

type Props = {
  onRotate: (direction: RotateDirection, scope: RotateScope) => void;
  /** Theme scope for the portalled menu (portals escape the shell's scope). */
  portalTheme: string;
};

/**
 * PAGE-section rotation control (Reckon-Bill prototype): a single trigger in
 * the toolbar's icon-over-label shape that opens a portalled dropdown — the
 * toolbar row is an overflow-scroll container, so the menu can't live inside
 * it. Strictly neutral, no brand accent.
 */
export default function RotateMenu({ onRotate, portalTheme }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8),
    });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Rotate"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={`flex flex-col items-center gap-[2px] rounded-lg px-1 py-0.5 cursor-pointer ${
          open ? 'text-body' : 'text-muted'
        }`}
      >
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            open ? 'bg-overlay/10' : 'hover:bg-overlay/10'
          }`}
        >
          <RotateCw className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <span className="flex items-center gap-0.5 whitespace-nowrap text-[9.5px] font-medium leading-none">
          Rotate
          <ChevronDown
            className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open &&
        coords &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setOpen(false)}
              onContextMenu={(e) => {
                e.preventDefault();
                setOpen(false);
              }}
            />
            <div
              role="menu"
              aria-label="Rotate options"
              data-theme={portalTheme}
              className="animate-float-in fixed z-[9999] rounded-lg border border-border bg-surface p-1 shadow-xl"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
            >
              {OPTIONS.map((opt, index) => (
                <div key={opt.label}>
                  {index === 2 && <div className="my-1 h-px bg-border" />}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      onRotate(opt.direction, opt.scope);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer"
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    <span className="shrink-0 text-[11px] text-muted">{opt.hint}</span>
                  </button>
                </div>
              ))}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
