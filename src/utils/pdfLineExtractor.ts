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

// Apply a 6-element CTM [a,b,c,d,e,f] to point (x,y)
function applyMatrix(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

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
// Coordinates are already in user-space with CTM applied by pdfjs before packing.
// Y-flip is applied here: pdfY → pageHeight - pdfY.
function parseDrawOps(
  data: ArrayLike<number>,
  pageHeight: number,
  segments: PdfSegment[]
) {
  let curX = 0, curY = 0;
  let subpathStartX = 0, subpathStartY = 0;
  let i = 0;

  while (i < data.length) {
    const op = data[i++];
    switch (op) {
      case DRAW_MOVETO: {
        const x = data[i++], y = data[i++];
        curX = x; curY = pageHeight - y;
        subpathStartX = curX; subpathStartY = curY;
        break;
      }
      case DRAW_LINETO: {
        const x = data[i++], y = data[i++];
        const nx = x, ny = pageHeight - y;
        segments.push({ x1: curX, y1: curY, x2: nx, y2: ny });
        curX = nx; curY = ny;
        break;
      }
      case DRAW_CURVETO: {
        const x1 = data[i++], y1 = data[i++];
        const x2 = data[i++], y2 = data[i++];
        const x3 = data[i++], y3 = data[i++];
        subdivideCubic(
          curX, curY,
          x1, pageHeight - y1,
          x2, pageHeight - y2,
          x3, pageHeight - y3,
          segments
        );
        curX = x3; curY = pageHeight - y3;
        break;
      }
      case DRAW_QUAD_CURVETO: {
        // Approximate quadratic as 3 linear steps
        const cx = data[i++], cy = data[i++];
        const x2 = data[i++], y2 = data[i++];
        const ex = x2, ey = pageHeight - y2;
        const cpx = cx, cpy = pageHeight - cy;
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
  const viewport = page.getViewport({ scale: 1 });
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
        parseDrawOps(pathData, pageHeight, segments);
      }
    }
  }

  return segments;
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

  /** Find closest point on any segment within `radius` of (px,py). */
  query(px: number, py: number, radius: number): { x: number; y: number } | null {
    const cs = this.cellSize;
    const r = Math.ceil(radius / cs);
    const cx0 = Math.floor(px / cs);
    const cy0 = Math.floor(py / cs);
    const r2 = radius * radius;
    let best: { x: number; y: number; dist2: number } | null = null;

    for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
      for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (!cell) continue;
        for (const seg of cell) {
          const res = closestPointOnSegment(px, py, seg.x1, seg.y1, seg.x2, seg.y2);
          if (res.dist2 < r2 && (!best || res.dist2 < best.dist2)) {
            best = res;
          }
        }
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }
}
