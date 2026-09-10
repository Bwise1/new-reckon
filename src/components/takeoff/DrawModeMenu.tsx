import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, PenLine, Square } from 'lucide-react';
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

// Wider than Rotate's 220: these rows carry an icon and a check mark on
// top of the label and hint, and "Point to Point" must not truncate.
const MENU_WIDTH = 272;

type Props = {
  /** The tool this button stands for (Area or Linear). */
  icon: ComponentType<{ className?: string }>;
  label: string;
  iconScale: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  /** Clicking the icon: pick the tool, or put it down when it is active. */
  onSelect: () => void;
  mode: DrawMode;
  onChange: (mode: DrawMode) => void;
  /** Theme scope for the portalled menu (portals escape the shell's scope). */
  portalTheme: string;
};

/**
 * The Area and Linear tool buttons, in the same shape as the toolbar's
 * Rotate control: the icon above a label that carries a small chevron, and a
 * portalled dropdown beneath. The icon still picks (or puts down) the tool;
 * the label opens the menu that decides HOW the tool draws — click every
 * corner, or two opposite corners for a rectangle.
 *
 * Box mode exists because building takeoff is overwhelmingly rectangles —
 * rooms, slabs, footings, openings. Tracing those vertex by vertex costs four
 * precise clicks each and never yields truly square corners.
 *
 * Portalled because the toolbar row is an overflow-scroll container that
 * would clip an inline menu.
 */
export default function DrawModeMenu({
  icon: Icon,
  label,
  iconScale,
  active,
  disabled,
  title,
  onSelect,
  mode,
  onChange,
  portalTheme,
}: Props) {
  const [rawOpen, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // A disabled control can't be clicked shut, so never show the menu while
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

  const current = OPTIONS.find((o) => o.mode === mode) ?? OPTIONS[0];

  return (
    <>
      <div
        ref={triggerRef}
        className={`flex flex-col items-center gap-[2px] rounded-lg px-1 py-0.5 ${
          disabled ? 'opacity-35' : ''
        } ${active || open ? 'text-body' : 'text-muted'}`}
      >
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          title={title ?? label}
          onClick={onSelect}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-default cursor-pointer ${
            active ? 'bg-accent text-accent-fg' : 'hover:bg-overlay/10'
          }`}
        >
          <Icon className={iconScale} />
        </button>
        <button
          type="button"
          aria-label={`${label} draw mode: ${current.label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          title={disabled ? title : `Draw mode — ${current.label}`}
          onClick={toggle}
          className={`flex items-center gap-0.5 whitespace-nowrap rounded px-0.5 text-[9.5px] font-medium leading-none transition-colors disabled:cursor-default cursor-pointer ${
            open ? 'text-body' : 'hover:text-body'
          }`}
        >
          {label}
          <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

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
              aria-label={`${label} draw mode`}
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
                    <Check
                      className={`h-3.5 w-3.5 shrink-0 ${selected ? 'opacity-100' : 'opacity-0'}`}
                      strokeWidth={2}
                    />
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
