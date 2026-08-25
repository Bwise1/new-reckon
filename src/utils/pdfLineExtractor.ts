import type * as pdfjsLib from "pdfjs-dist";

export interface PdfSegment {
  x1: number; y1: number;
  x2: number; y2: number;
}

// Modern pdfjs (3.x+) batches all path commands into constructPath (91).
// The first arg is a flat DrawOPS array; coords follow inline.
const OPS_CONSTRUCT_PATH = 91;
const OPS_SAVE           = 10;
const OPS_RESTORE        = 11;
const OPS_TRANSFORM      = 12;

// DrawOPS codes packed inside constructPath args[0]
const DRAW_MOVETO        = 0;
const DRAW_LINETO        = 1;
const DRAW_CURVETO       = 2;  // bezierCurveTo: 6 coords
const DRAW_QUAD_CURVETO  = 3;  // quadraticCurveTo: 4 coords
const DRAW_CLOSE         = 4;

function multiplyMatrix(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

const IDENTITY = [1, 0, 0, 1, 0, 0];

// Subdivide a cubic bezier into ~4 line segments for snap purposes
function subdivideCubic(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  segments: PdfSegment[],
  steps = 4
) {
  let px = x0, py = y0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3;
    const y = mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3;
    segments.push({ x1: px, y1: py, x2: x, y2: y });
    px = x; py = y;
  }
}

// Parse a flat DrawOPS array (as packed by pdfjs constructPath) into segments.
// Path coordinates are in the path's OWN space: the current transformation
// matrix must be applied here. CAD exports virtually always wrap content in
// scale/translate transforms, so skipping the CTM put segments thousands of
// points outside the page and snap-to-line silently never matched.
// Y-flip to a top-left origin is applied after the CTM.
function parseDrawOps(
  data: ArrayLike<number>,
  pageHeight: number,
  segments: PdfSegment[],
  ctm: number[]
) {
  const [a, b, c, d, e, f] = ctm;
  const tx = (x: number, y: number) => a * x + c * y + e;
  const ty = (x: number, y: number) => b * x + d * y + f;
  let curX = 0, curY = 0;
  let subpathStartX = 0, subpathStartY = 0;
  let i = 0;

  while (i < data.length) {
    const op = data[i++];
    switch (op) {
      case DRAW_MOVETO: {
        const x = data[i++], y = data[i++];
        curX = tx(x, y); curY = pageHeight - ty(x, y);
        subpathStartX = curX; subpathStartY = curY;
        break;
      }
      case DRAW_LINETO: {
        const x = data[i++], y = data[i++];
        const nx = tx(x, y), ny = pageHeight - ty(x, y);
        segments.push({ x1: curX, y1: curY, x2: nx, y2: ny });
        curX = nx; curY = ny;
        break;
      }
      case DRAW_CURVETO: {
        const x1 = data[i++], y1 = data[i++];
        const x2 = data[i++], y2 = data[i++];
        const x3 = data[i++], y3 = data[i++];
        // Affine transforms map Bezier control points directly.
        const ex3 = tx(x3, y3), ey3 = pageHeight - ty(x3, y3);
        subdivideCubic(
          curX, curY,
          tx(x1, y1), pageHeight - ty(x1, y1),
          tx(x2, y2), pageHeight - ty(x2, y2),
          ex3, ey3,
          segments
        );
        curX = ex3; curY = ey3;
        break;
      }
      case DRAW_QUAD_CURVETO: {
        // Approximate quadratic as 3 linear steps
        const cx = data[i++], cy = data[i++];
        const x2 = data[i++], y2 = data[i++];
        const ex = tx(x2, y2), ey = pageHeight - ty(x2, y2);
        const cpx = tx(cx, cy), cpy = pageHeight - ty(cx, cy);
        // Elevate to cubic: cp1 = start + 2/3*(cp-start), cp2 = end + 2/3*(cp-end)
        subdivideCubic(
          curX, curY,
          curX + (2/3)*(cpx - curX), curY + (2/3)*(cpy - curY),
          ex   + (2/3)*(cpx - ex),   ey   + (2/3)*(cpy - ey),
          ex, ey,
          segments, 3
        );
        curX = ex; curY = ey;
        break;
      }
      case DRAW_CLOSE: {
        if (curX !== subpathStartX || curY !== subpathStartY) {
          segments.push({ x1: curX, y1: curY, x2: subpathStartX, y2: subpathStartY });
        }
        curX = subpathStartX; curY = subpathStartY;
        break;
      }
      default:
        // Unknown op — stop parsing this batch to avoid index corruption
        return;
    }
  }
}

/**
 * Extract all line segments from a PDF page's operator list.
 * Returns coordinates in PDF user space (scale=1, Y flipped to top-left origin).
 * These match the image-pixel coordinate space used by the canvas when imageScale=1.
 */
export async function extractPdfSegments(
  page: pdfjsLib.PDFPageProxy
): Promise<PdfSegment[]> {
  const ops = await page.getOperatorList();
  // rotation: 0 pins the viewport to the UNROTATED page box. getViewport with
  // no rotation applies the page's inherent /Rotate, whose height is the wrong
  // flip axis for CTM-applied (MediaBox-space) path coordinates - segments
  // came out shifted by the width/height difference on rotated pages.
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  const pageHeight = viewport.height;

  const segments: PdfSegment[] = [];
  const ctmStack: number[][] = [IDENTITY];
  let ctm = IDENTITY;

  const { fnArray, argsArray } = ops;


  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as number[];

    if (fn === OPS_SAVE) {
      ctmStack.push(ctm);
    } else if (fn === OPS_RESTORE) {
      ctm = ctmStack.pop() ?? IDENTITY;
    } else if (fn === OPS_TRANSFORM) {
      ctm = multiplyMatrix(ctm, args);
    } else if (fn === OPS_CONSTRUCT_PATH) {
      // Format (pdfjs 3.x+): args = [paintOp, [Float32Array(ops+coords)], minMaxFloat32Array]
      // The path data is args[1][0] — a Float32Array with DrawOPS codes interleaved with coords.
      const pathData = (args as unknown as [number, ArrayLike<number>[], Float32Array])[1]?.[0];
      if (pathData && pathData.length > 0) {
        parseDrawOps(pathData, pageHeight, segments, ctm);
      }
    }
  }

  return segments;
}

/**
 * Map a point from ROTATED page space (what the canvas displays) to the
 * UNROTATED space segments are extracted in. `w`/`h` are the UNROTATED page
 * dimensions; rotation is pdf.js viewport rotation (0/90/180/270, clockwise).
 * Both spaces are top-left origin.
 */
export function rotatedToUnrotated(
  x: number,
  y: number,
  rotation: number,
  w: number,
  h: number
): { x: number; y: number } {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: y, y: h - x };
    case 180:
      return { x: w - x, y: h - y };
    case 270:
      return { x: w - y, y: x };
    default:
      return { x, y };
  }
}

/** Inverse of rotatedToUnrotated: unrotated page space to rotated display space. */
export function unrotatedToRotated(
  x: number,
  y: number,
  rotation: number,
  w: number,
  h: number
): { x: number; y: number } {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: h - y, y: x };
    case 180:
      return { x: w - x, y: h - y };
    case 270:
      return { x: y, y: w - x };
    default:
      return { x, y };
  }
}

/** Closest point on segment (x1,y1)→(x2,y2) to point (px,py). Returns distance² and point. */
export function closestPointOnSegment(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number
): { x: number; y: number; dist2: number } {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: x1, y: y1, dist2: (px-x1)**2 + (py-y1)**2 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return { x: cx, y: cy, dist2: (px - cx)**2 + (py - cy)**2 };
}

/**
 * Simple grid-based spatial index for fast nearest-segment queries.
 * Cell size should be ~10× the expected snap radius for good performance.
 */
export class SegmentIndex {
  private cells = new Map<string, PdfSegment[]>();
  private cellSize: number;

  constructor(cellSize = 50) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cy: number) { return `${cx},${cy}`; }

  add(seg: PdfSegment) {
    const cs = this.cellSize;
    const x1c = Math.floor(seg.x1 / cs);
    const y1c = Math.floor(seg.y1 / cs);
    const x2c = Math.floor(seg.x2 / cs);
    const y2c = Math.floor(seg.y2 / cs);
    const minX = Math.min(x1c, x2c);
    const maxX = Math.max(x1c, x2c);
    const minY = Math.min(y1c, y2c);
    const maxY = Math.max(y1c, y2c);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const k = this.key(cx, cy);
        let cell = this.cells.get(k);
        if (!cell) { cell = []; this.cells.set(k, cell); }
        cell.push(seg);
      }
    }
  }

  /** Find the best snap target within `radius` of (px,py). Priority follows
   *  CAD convention: segment endpoints beat midpoints beat points on the line,
   *  so corners win even when the cursor is fractionally closer to an edge. */
  query(
    px: number,
    py: number,
    radius: number
  ): { x: number; y: number; kind: "endpoint" | "midpoint" | "edge" } | null {
    const cs = this.cellSize;
    const r = Math.ceil(radius / cs);
    const cx0 = Math.floor(px / cs);
    const cy0 = Math.floor(py / cs);
    const r2 = radius * radius;
    const RANK = { endpoint: 0, midpoint: 1, edge: 2 } as const;
    let best:
      | { x: number; y: number; dist2: number; kind: "endpoint" | "midpoint" | "edge" }
      | null = null;
    const consider = (x: number, y: number, kind: "endpoint" | "midpoint" | "edge") => {
      const dx = x - px;
      const dy = y - py;
      const dist2 = dx * dx + dy * dy;
      if (dist2 >= r2) return;
      if (!best || RANK[kind] < RANK[best.kind] || (RANK[kind] === RANK[best.kind] && dist2 < best.dist2)) {
        best = { x, y, dist2, kind };
      }
    };

    for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
      for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (const seg of cell) {
          consider(seg.x1, seg.y1, "endpoint");
          consider(seg.x2, seg.y2, "endpoint");
          consider((seg.x1 + seg.x2) / 2, (seg.y1 + seg.y2) / 2, "midpoint");
          const res = closestPointOnSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
          consider(res.x, res.y, "edge");
        }
      }
    }
    // TS cannot see the closure assignments above, so re-widen explicitly.
    const found = best as { x: number; y: number; kind: "endpoint" | "midpoint" | "edge" } | null;
    return found ? { x: found.x, y: found.y, kind: found.kind } : null;
  }
}
