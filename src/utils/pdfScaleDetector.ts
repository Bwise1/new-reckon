/**
 * Auto-detect the drawing scale printed on a PDF sheet ("1:100", "SCALE 1:50",
 * "1 : 200") from the page's text layer. Architectural sheets almost always
 * state their scale in the title block, so a detected ratio plus the page's
 * physical size gives a calibration suggestion with zero clicks.
 *
 * Returns the most frequent plausible ratio on the page, or null. Detection is
 * a SUGGESTION only — the UI must let the user confirm, since sheets can carry
 * multiple scales ("details 1:20, plan 1:100") or be printed "NOT TO SCALE".
 */

import type * as pdfjsLib from 'pdfjs-dist';

/** Ratios outside this range are almost certainly not drawing scales. */
const MIN_RATIO = 2;
const MAX_RATIO = 2500;

const SCALE_TOKEN = /\b1\s*[:：]\s*(\d{1,4})\b/g;

export interface DetectedScale {
  /** The N of 1:N. */
  ratio: number;
  /** How many separate matches of this ratio the page carries. */
  occurrences: number;
}

export async function detectDrawingScale(
  page: pdfjsLib.PDFPageProxy
): Promise<DetectedScale | null> {
  let text: string;
  try {
    const content = await page.getTextContent();
    text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
  } catch {
    return null;
  }
  if (!text) return null;

  const counts = new Map<number, number>();
  for (const match of text.matchAll(SCALE_TOKEN)) {
    const ratio = Number(match[1]);
    if (!Number.isFinite(ratio) || ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
    counts.set(ratio, (counts.get(ratio) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  // Most frequent wins; ties break toward the LARGER ratio because the main
  // floor plan is usually the smallest scale (largest N) on a mixed sheet.
  let best: DetectedScale | null = null;
  for (const [ratio, occurrences] of counts) {
    if (
      !best ||
      occurrences > best.occurrences ||
      (occurrences === best.occurrences && ratio > best.ratio)
    ) {
      best = { ratio, occurrences };
    }
  }
  return best;
}

/**
 * Convert a detected 1:N ratio into the calibration value the store expects:
 * display-bitmap pixels per real-world meter.
 *
 * 1 real meter appears as (1000 / ratio) mm on paper; paper mm → PDF pt is
 * 72 / 25.4; pt → display-bitmap px is the page's displayScale.
 */
export const ratioToPxPerMeter = (ratio: number, displayScale: number): number =>
  (1000 / ratio) * (72 / 25.4) * displayScale;

/** Inverse of ratioToPxPerMeter: calibration (display px per meter) back to
 *  the paper ratio N of 1:N. Only meaningful for PDFs, where displayScale ties
 *  bitmap px to true physical points. */
export const pxPerMeterToRatio = (pxPerMeter: number, displayScale: number): number =>
  (1000 * 72 * displayScale) / (25.4 * pxPerMeter);

/** Architect/engineer scales a sheet is plausibly drawn at. */
const STANDARD_RATIOS = [
  1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 2000,
];

/**
 * Snap a derived ratio to the nearest standard drawing scale when it is within
 * tolerance (default 2.5% — hand calibration is never exact). Returns the raw
 * rounded ratio otherwise, so an unusual-but-real scale still shows truthfully.
 */
export const snapToStandardRatio = (ratio: number, tolerance = 0.025): number => {
  for (const std of STANDARD_RATIOS) {
    if (Math.abs(ratio - std) / std <= tolerance) return std;
  }
  return Math.round(ratio);
};
