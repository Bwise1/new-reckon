import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export interface TourStep {
  /** data-tour value of the element to highlight. Omit for a centred step. */
  anchor?: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;      // spotlight padding around the anchor
const TIP_W = 300;  // tooltip width
const GAP = 12;     // gap between spotlight and tooltip

/**
 * Dependency-free coach-mark tour: dims the page, cuts a spotlight around the
 * step's anchor element, and places a tooltip beside it. Anchors are located
 * by `data-tour="..."`, which survives styling changes.
 *
 * A step whose anchor isn't on screen (e.g. a panel that isn't open) is
 * skipped automatically rather than pointing at nothing.
 */
export default function TourGuide({
  steps,
  onFinish,
}: {
  steps: TourStep[];
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const findAnchor = useCallback(
    (i: number): HTMLElement | null => {
      const a = steps[i]?.anchor;
      if (!a) return null;
      return document.querySelector<HTMLElement>(`[data-tour="${a}"]`);
    },
    [steps]
  );

  // Skip forward past steps whose anchor isn't rendered right now.
  useEffect(() => {
    let i = index;
    while (i < steps.length && steps[i].anchor && !findAnchor(i)) i += 1;
    if (i !== index) {
      if (i >= steps.length) onFinish();
      else setIndex(i);
    }
  }, [index, steps, findAnchor, onFinish]);

  // Measure the current anchor (and keep it correct on resize/scroll).
  useLayoutEffect(() => {
    const measure = () => {
      const el = findAnchor(index);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [index, findAnchor]);

  // Escape exits the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onFinish();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onFinish]);

  const step = steps[index];
  if (!step) return null;

  const isLast = index === steps.length - 1;
  const next = () => (isLast ? onFinish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Tooltip placement: below the anchor when there's room, else above;
  // centred on screen for anchor-less steps.
  let tipStyle: React.CSSProperties;
  if (rect) {
    const below = rect.top + rect.height + GAP;
    const roomBelow = window.innerHeight - below > 190;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - TIP_W / 2),
      window.innerWidth - TIP_W - 8
    );
    tipStyle = roomBelow
      ? { top: below, left, width: TIP_W }
      : { top: Math.max(8, rect.top - GAP - 180), left, width: TIP_W };
  } else {
    tipStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: TIP_W,
    };
  }

  return (
    <div className="fixed inset-0 z-[10000]">
      {/* Dim + spotlight. A huge box-shadow on a transparent hole is the
          simplest way to darken everything except the anchor. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
            outline: '2px solid #289693',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <div
        className="absolute rounded-xl bg-white p-4 shadow-2xl"
        style={tipStyle}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#289693]">
          Step {index + 1} of {steps.length}
        </p>
        <h3 className="mt-1 text-base font-bold text-gray-900">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onFinish}
            className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            Skip tour
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-[#003566] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#002847] cursor-pointer"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
