/**
 * Single-click area detection: flood-fill the enclosed region around a click
 * and return its boundary as a polygon. See docs/single-click-area.md.
 *
 * Everything here works in the pixel space of the ImageData it is given — the
 * caller decides resolution (typically a downscaled copy of the plan bitmap
 * with the wall-like vector segments stroked on top) and converts the
 * returned polygon back to measurement space.
 *
 * The pipeline, and why each stage exists:
 *
 *  1. Threshold — Otsu's method on the luminance histogram, with polarity
 *     detection, instead of a fixed cut-off. Black-on-white drawings, grey or
 *     coloured linework and white-on-dark scans all split correctly.
 *  2. Tiered gap bridging — the fill is tried against the walls as drawn,
 *     then against walls dilated by 1, 2 … px. A scanned line break or an
 *     anti-aliasing gap is closed by the first tier; a real opening needs a
 *     wider one, and the result says how wide, so the caller can tell the
 *     person. A fill that reaches the page edge has leaked out of the
 *     building and is rejected regardless of size.
 *  3. Trace + simplify — Moore-neighbour contour, Ramer–Douglas–Peucker.
 *  4. Snap — vertices move onto the nearest true vector corner when one is
 *     close, and edges that are nearly axis-aligned are squared, so the
 *     outline reads as drawn rather than as traced pixels.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface DetectedPolygon {
  /** Boundary vertices in input-pixel coordinates, in order. */
  points: Pt[];
  /** Filled pixels — for confidence/telemetry. */
  filledPixels: number;
  /** Dilation radius (px) that was needed to close the room; 0 = as drawn. */
  bridged: number;
  /** Luminance threshold used, and whether the drawing is light-on-dark. */
  threshold: number;
  inverted: boolean;
}

export type DetectFailure =
  /** The click landed on a line. */
  | 'on-wall'
  /** Every tier leaked to the page edge or past the area guard: an opening
   *  wider than the bridging allowed. */
  | 'leaked'
  /** A fill too small to be a room (a click inside a letter). */
  | 'too-small'
  /** The mask could not be traced (degenerate). */
  | 'no-boundary';

export type DetectResult =
  | ({ ok: true } & DetectedPolygon)
  | { ok: false; reason: DetectFailure };

export interface DetectOptions {
  /** Luminance cut-off (0-255), or 'auto' for Otsu + polarity detection. */
  wallThreshold?: number | 'auto';
  /** Abort if the fill exceeds this fraction of the image (leak guard). */
  maxAreaFraction?: number;
  /** Ramer-Douglas-Peucker tolerance in pixels. */
  epsilon?: number;
  /** Wall dilation radii to try, in order. [0] alone disables bridging. */
  bridgeRadii?: number[];
  /** Vector corners (same pixel space) to snap vertices onto, within radius. */
  snap?: { points: Pt[]; radius: number } | null;
  /** Square edges within this many degrees of horizontal/vertical; 0 = off. */
  orthoAngleDeg?: number;
}

const DEFAULTS = {
  // The page-edge check is the real leak detector (a fill that escapes the
  // building always reaches the border); this only stops a runaway fill of
  // a near-blank page. A whole-floor slab can legitimately be most of the
  // sheet, so it must not be tight.
  maxAreaFraction: 0.9,
  epsilon: 2.5,
  bridgeRadii: [0, 1, 2],
  orthoAngleDeg: 4,
  minFillPixels: 64,
};

// ─── Threshold ───────────────────────────────────────────────────────────────

const luminanceOf = (image: ImageData): Uint8Array => {
  const { width, height, data } = image;
  const lum = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) | 0;
  }
  return lum;
};

/**
 * Otsu's threshold: the luminance cut that best separates the two classes
 * (ink vs paper) in the histogram. Clamped so a nearly blank page, whose
 * histogram is one spike, still gets a sane cut rather than 0 or 255.
 */
export const otsuThreshold = (lum: Uint8Array): number => {
  const hist = new Uint32Array(256);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
  const total = lum.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 180;
  let bestMeans: [number, number] | null = null;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
      bestMeans = [mB, mF];
    }
  }
  // Otsu's own cut sits wherever the variance peaks, which for a clean
  // two-tone drawing is right next to the ink spike — anti-aliased edge
  // pixels on a real scan would then count as paper and thin every wall.
  // Cut halfway between the two class means instead: the same split for a
  // bimodal image, and a fairer one when the edges are soft.
  if (bestMeans) threshold = Math.round((bestMeans[0] + bestMeans[1]) / 2);
  // Ink is normally a small minority, so a very low or very high cut means
  // the histogram was not really bimodal; keep it inside a plausible band.
  return Math.min(230, Math.max(90, threshold));
};

/** 1 = wall (ink), 0 = paper. Handles white-on-dark drawings by inverting. */
const wallMask = (
  lum: Uint8Array,
  threshold: number | 'auto'
): { mask: Uint8Array; threshold: number; inverted: boolean } => {
  const t = threshold === 'auto' ? otsuThreshold(lum) : threshold;
  let dark = 0;
  for (let i = 0; i < lum.length; i++) if (lum[i] < t) dark++;
  // Ink covers a minority of any drawing; if "dark" is the majority the page
  // itself is dark and the lines are light.
  const inverted = dark > lum.length / 2;
  const mask = new Uint8Array(lum.length);
  for (let i = 0; i < lum.length; i++) {
    mask[i] = (inverted ? lum[i] >= t : lum[i] < t) ? 1 : 0;
  }
  return { mask, threshold: t, inverted };
};

// ─── Morphology ──────────────────────────────────────────────────────────────

/** Square dilation by r, separable (horizontal max then vertical max). */
const dilate = (mask: Uint8Array, width: number, height: number, r: number): Uint8Array => {
  if (r <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let run = 0; // pixels remaining in the current "on" span
    for (let x = 0; x < width; x++) {
      // Look ahead r: an on-pixel within [x, x+r] turns this pixel on.
      if (mask[row + Math.min(width - 1, x + r)]) run = 2 * r + 1;
      else if (run > 0) run--;
      if (x < r) {
        // Near the left edge the look-ahead window is the only source.
        let on = 0;
        for (let k = 0; k <= Math.min(width - 1, x + r); k++) if (mask[row + k]) { on = 1; break; }
        tmp[row + x] = on;
      } else {
        tmp[row + x] = run > 0 ? 1 : 0;
      }
    }
  }
  const out = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    let run = 0;
    for (let y = 0; y < height; y++) {
      if (tmp[Math.min(height - 1, y + r) * width + x]) run = 2 * r + 1;
      else if (run > 0) run--;
      if (y < r) {
        let on = 0;
        for (let k = 0; k <= Math.min(height - 1, y + r); k++) if (tmp[k * width + x]) { on = 1; break; }
        out[y * width + x] = on;
      } else {
        out[y * width + x] = run > 0 ? 1 : 0;
      }
    }
  }
  return out;
};

// ─── Flood fill ──────────────────────────────────────────────────────────────

interface Fill {
  filled: Uint8Array;
  count: number;
  touchesBorder: boolean;
}

/**
 * Scanline flood fill over non-wall pixels from (sx, sy). Stops early when
 * the fill exceeds `maxFill` (returns null). Records whether the fill reached
 * the image border, which a room never does.
 */
const floodFill = (
  wall: Uint8Array,
  width: number,
  height: number,
  sx: number,
  sy: number,
  maxFill: number
): Fill | null => {
  const filled = new Uint8Array(width * height);
  let count = 0;
  let touchesBorder = false;
  const open = (x: number, y: number) => !filled[y * width + x] && !wall[y * width + x];
  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (!open(x, y)) continue;
    let xL = x;
    while (xL > 0 && open(xL - 1, y)) xL--;
    let xR = x;
    while (xR < width - 1 && open(xR + 1, y)) xR++;
    for (let i = xL; i <= xR; i++) filled[y * width + i] = 1;
    count += xR - xL + 1;
    if (count > maxFill) return null;
    if (y === 0 || y === height - 1 || xL === 0 || xR === width - 1) touchesBorder = true;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let i = xL; i <= xR; i++) {
        const o = open(i, ny);
        if (o && !inRun) {
          stack.push(i, ny);
          inRun = true;
        } else if (!o) {
          inRun = false;
        }
      }
    }
  }
  return { filled, count, touchesBorder };
};

/** Nearest non-wall pixel to (x, y) within `r` — a click swallowed by dilation. */
const nearestOpen = (
  wall: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  r: number
): Pt | null => {
  if (!wall[y * width + x]) return { x, y };
  for (let d = 1; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        if (!wall[ny * width + nx]) return { x: nx, y: ny };
      }
    }
  }
  return null;
};

// ─── Main ────────────────────────────────────────────────────────────────────

export function detectRoomPolygon(
  image: ImageData,
  startX: number,
  startY: number,
  options: DetectOptions = {}
): DetectResult {
  const maxAreaFraction = options.maxAreaFraction ?? DEFAULTS.maxAreaFraction;
  const epsilon = options.epsilon ?? DEFAULTS.epsilon;
  const radii = options.bridgeRadii && options.bridgeRadii.length > 0 ? options.bridgeRadii : DEFAULTS.bridgeRadii;
  const orthoAngleDeg = options.orthoAngleDeg ?? DEFAULTS.orthoAngleDeg;

  const { width, height } = image;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return { ok: false, reason: 'on-wall' };

  const lum = luminanceOf(image);
  const { mask: wall0, threshold, inverted } = wallMask(lum, options.wallThreshold ?? 'auto');
  if (wall0[sy * width + sx]) return { ok: false, reason: 'on-wall' };

  const maxFill = Math.floor(width * height * maxAreaFraction);

  let region: Uint8Array | null = null;
  let count = 0;
  let bridged = 0;
  for (const r of radii) {
    const wall = r > 0 ? dilate(wall0, width, height, r) : wall0;
    const seed = nearestOpen(wall, width, height, sx, sy, r + 1);
    if (!seed) continue;
    const fill = floodFill(wall, width, height, seed.x, seed.y, maxFill);
    if (!fill || fill.touchesBorder) continue; // leaked at this tier
    if (r > 0) {
      // Grow the fill back out to the walls as drawn (dilation shrank the
      // room by r), stopping at real ink. Closed gaps stay closed: they were
      // never part of the fill, so growth only reaches r px into them.
      const grown = dilate(fill.filled, width, height, r);
      region = new Uint8Array(grown.length);
      count = 0;
      for (let i = 0; i < grown.length; i++) {
        if (grown[i] && !wall0[i]) {
          region[i] = 1;
          count++;
        }
      }
    } else {
      region = fill.filled;
      count = fill.count;
    }
    bridged = r;
    break;
  }
  if (!region) return { ok: false, reason: 'leaked' };
  if (count < DEFAULTS.minFillPixels) return { ok: false, reason: 'too-small' };

  const boundary = traceBoundary(region, width, height);
  if (!boundary || boundary.length < 8) return { ok: false, reason: 'no-boundary' };

  let points = simplifyClosed(boundary, epsilon);
  if (points.length < 3) return { ok: false, reason: 'no-boundary' };

  const snapped = options.snap ? snapToCorners(points, options.snap.points, options.snap.radius) : points.map(() => false);
  if (orthoAngleDeg > 0) points = orthogonalise(points, snapped, orthoAngleDeg, epsilon);

  return { ok: true, points, filledPixels: count, bridged, threshold, inverted };
}

// ─── Snapping ────────────────────────────────────────────────────────────────

/** Move each vertex onto the nearest corner within radius; returns flags. */
const snapToCorners = (points: Pt[], corners: Pt[], radius: number): boolean[] => {
  const r2 = radius * radius;
  return points.map((p) => {
    let best: Pt | null = null;
    let bestD = r2;
    for (const c of corners) {
      const dx = c.x - p.x;
      const dy = c.y - p.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return false;
    p.x = best.x;
    p.y = best.y;
    return true;
  });
};

/**
 * Square edges that are nearly horizontal or vertical. A traced outline of a
 * rectangular room wanders by a pixel along each wall; a person drawing it
 * would not. Snapped vertices are true corners and stay put — their free
 * neighbour moves to meet them.
 */
const orthogonalise = (points: Pt[], snapped: boolean[], angleDeg: number, minLen: number): Pt[] => {
  const tol = Math.tan((angleDeg * Math.PI) / 180);
  const out = points.map((p) => ({ ...p }));
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const a = out[i];
    const b = out[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < minLen * 3) continue;
    const fa = snapped[i];
    const fb = snapped[(i + 1) % n];
    if (fa && fb) continue;
    if (Math.abs(dy) <= Math.abs(dx) * tol) {
      const y = fa ? a.y : fb ? b.y : (a.y + b.y) / 2;
      if (!fa) a.y = y;
      if (!fb) b.y = y;
    } else if (Math.abs(dx) <= Math.abs(dy) * tol) {
      const x = fa ? a.x : fb ? b.x : (a.x + b.x) / 2;
      if (!fa) a.x = x;
      if (!fb) b.x = x;
    }
  }
  return out;
};

// ─── Contour ─────────────────────────────────────────────────────────────────

/** Moore-neighbour boundary trace of the filled mask (outer contour). */
function traceBoundary(mask: Uint8Array, width: number, height: number): Pt[] | null {
  let sx = -1;
  let sy = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        sx = x;
        sy = y;
        break outer;
      }
    }
  }
  if (sx === -1) return null;

  const inMask = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  // 8-neighbourhood, clockwise starting from W.
  const N8 = [
    [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1],
  ];

  const contour: Pt[] = [];
  let cx = sx;
  let cy = sy;
  let backtrack = 0;
  const maxSteps = 4 * (width + height) * 8;

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: cx, y: cy });
    let found = false;
    for (let i = 1; i <= 8; i++) {
      const dir = (backtrack + i) % 8;
      const nx = cx + N8[dir][0];
      const ny = cy + N8[dir][1];
      if (inMask(nx, ny)) {
        backtrack = (dir + 5) % 8;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) return contour;
    if (cx === sx && cy === sy && contour.length > 2) return contour;
  }
  return contour;
}

/** RDP on a closed loop: anchor at the two most distant vertices, simplify
 *  both halves, and stitch. */
function simplifyClosed(points: Pt[], epsilon: number): Pt[] {
  if (points.length <= 4) return points;
  let far = 1;
  let best = -1;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[0].x;
    const dy = points[i].y - points[0].y;
    const d = dx * dx + dy * dy;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const half1 = rdp(points.slice(0, far + 1), epsilon);
  const half2 = rdp(points.slice(far).concat([points[0]]), epsilon);
  return half1.slice(0, -1).concat(half2.slice(0, -1));
}

function rdp(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let index = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = Math.abs(dy * points[i].x - dx * points[i].y + last.x * first.y - last.y * first.x) / len;
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist <= epsilon) return [first, last];
  const left = rdp(points.slice(0, index + 1), epsilon);
  const right = rdp(points.slice(index), epsilon);
  return left.slice(0, -1).concat(right);
}
