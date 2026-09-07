import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, PenLine, Square } from 'lucide-react';
import type { DrawMode } from '@/types/takeoff';

type Option = {
  mode: DrawMode;
  icon: typeof PenLine;
  label: string;
  hint: string;
};

const OPTIONS: Option[] = [
  { mode: 'point', icon: PenLine, label: 'Point to Point', hint: 'Click each corner' },
  { mode: 'box', icon: Square, label: 'Box Mode', hint: '2 opposite corners' },
];

const MENU_WIDTH = 230;

type Props = {
  mode: DrawMode;
  onChange: (mode: DrawMode) => void;
  disabled?: boolean;
  /** Theme scope for the portalled menu (portals escape the shell's scope). */
  portalTheme: string;
};

/**
 * The draw-mode caret that hangs off the Area and Linear tool buttons.
 *
 * Box mode exists because building takeoff is overwhelmingly rectangles —
 * rooms, slabs, footings, openings. Tracing those vertex by vertex costs four
 * precise clicks each and never yields truly square corners; two opposite
 * corners do the same job exactly.
 *
 * It rides on the tool it modifies rather than sitting elsewhere in the
 * toolbar, so the choice reads as "how this tool draws". Like zzTakeoff, the
 * caret is revealed on hover in the button's top-right corner rather than
 * shown permanently, keeping the toolbar's resting state uncluttered — it
 * also stays visible while its menu is open or when focused by keyboard, so
 * it is neither unreachable nor disappearing mid-interaction. It is its own
 * button layered over the tool: clicking the tool still just picks the tool,
 * and only the caret opens the menu. Portalled because the toolbar row is an
 * overflow-scroll container that would clip an inline menu.
 */
export default function DrawModeMenu({ mode, onChange, disabled, portalTheme }: Props) {
  const [rawOpen, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // A disabled caret can't be clicked shut, so never show the menu while
  // disabled — derived during render rather than corrected by an effect.
  const open = rawOpen && !disabled;

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

  const toggle = (e: React.MouseEvent) => {
    // The caret sits on top of the tool button; without this the click would
    // also select the tool underneath.
    e.stopPropagation();
    e.preventDefault();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({
      top: rect.bottom + 6,
      left: Math.min(rect.left - MENU_WIDTH / 2, window.innerWidth - MENU_WIDTH - 8),
    });
    setOpen(true);
  };

  const current = OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Draw mode: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        title={disabled ? 'Read-only role' : `Draw mode — ${current.label}`}
        className={`absolute right-0.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-sm text-current transition-opacity disabled:cursor-default disabled:opacity-0 cursor-pointer focus-visible:opacity-100 ${
          open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <ChevronDown
          className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
        />
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
              aria-label="Draw mode"
              data-theme={portalTheme}
              className="animate-float-in fixed z-[9999] rounded-lg border border-border bg-surface p-1 shadow-xl"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
            >
              {OPTIONS.map((opt) => {
                const OptIcon = opt.icon;
                const selected = opt.mode === mode;
                return (
                  <button
                    key={opt.mode}
                    role="menuitemradio"
                    aria-checked={selected}
                    type="button"
                    onClick={() => {
                      onChange(opt.mode);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-overlay/5 cursor-pointer ${
                      selected ? 'text-body' : 'text-muted'
                    }`}
                  >
                    <OptIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    <span className="shrink-0 text-[11px] text-muted">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </>
  );
}
