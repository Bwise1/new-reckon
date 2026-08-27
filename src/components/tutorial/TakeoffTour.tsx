import { useCallback, useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import TourGuide, { type TourStep } from './TourGuide';

const SEEN_KEY = 'reckon_tour_seen_v1';

/** The walkthrough: upload → calibrate → measure → BOQ → export. Anchors are
 *  data-tour attributes on the real UI, so the tour points at live controls
 *  rather than a mock. */
const STEPS: TourStep[] = [
  {
    title: 'Welcome to Reckon',
    body: "Here's a 60-second tour of how a takeoff works. You can skip it now and replay it any time from the Help button.",
  },
  {
    anchor: 'upload-plan',
    title: '1. Upload your plan',
    body: 'Start here. Reckon accepts PDF, PNG/JPEG and DXF drawings. Multi-page PDFs get a page selector at the bottom of the canvas.',
  },
  {
    anchor: 'calibrate',
    title: '2. Set the scale',
    body: 'Before measuring, click Calibrate and draw a line over a known dimension on the plan, then type its real length. Every measurement depends on this.',
  },
  {
    anchor: 'tools',
    title: '3. Measure',
    body: 'Pick Area, Linear or Count, then click points on the plan. Double-click to finish a shape. Right-click a finished area to cut out an opening.',
  },
  {
    anchor: 'export',
    title: '4. Build your BOQ and export',
    body: 'Measurements feed the Bill of Quantities on the right — add rates, then Export to PDF or Excel when you are done.',
  },
];

/**
 * Runs the tour automatically the first time a user opens a project, and
 * leaves a Help button to replay it. Completion is stored in localStorage.
 */
export default function TakeoffTour() {
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY)) return;
    // Let the canvas/toolbar mount before measuring anchors.
    const t = window.setTimeout(() => setRunning(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  const finish = useCallback(() => {
    localStorage.setItem(SEEN_KEY, '1');
    setRunning(false);
  }, []);

  return (
    <>
      {/* Offset past the 380px BOQ sidebar AND the canvas zoom controls:
          anchored near the right edge, this sat on top of each card's
          duplicate/delete row. Sits left of the Feedback pill, which clears
          the same column. */}
      <button
        type="button"
        onClick={() => setRunning(true)}
        title="Replay the tutorial"
        aria-label="Replay the tutorial"
        className="fixed bottom-12 right-[610px] z-[8999] flex items-center gap-1.5 rounded-full bg-paper px-3 py-2 text-sm font-semibold text-charcoal shadow-lg border border-charcoal/10 hover:shadow-xl transition-shadow cursor-pointer"
      >
        <HelpCircle className="h-4 w-4" />
        Help
      </button>
      {running && <TourGuide steps={STEPS} onFinish={finish} />}
    </>
  );
}
