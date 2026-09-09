/**
 * Which of a PDF's vector lines are walls?
 *
 * Single-click area detection strokes the plan's vector segments over the
 * bitmap so the flood fill has clean, gap-free boundaries. But a drawing's
 * linework is mostly NOT walls: dimension strings, hatching, text outlines,
 * leaders, grid lines and symbols. Treated as walls they slice a room into
 * fragments or stop the fill a few centimetres in. This module keeps the
 * wall-like lines and drops the rest, with three cheap, scale-aware tests:
 *
 *  - short strokes (text, ticks, symbols, hatch stubs) — by length;
 *  - hatch lattices — five or more parallel, evenly spaced strokes;
 *  - dimension strings — a long run with short perpendicular witness lines
 *    touching it near both ends.
 *
 * Everything is in one pixel space (the caller transforms segments first),
 * and the thresholds arrive in that space too, derived from the calibration
 * where there is one. Pure, so it is testable on synthetic drawings.
 */

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface WallFilterOptions {
  /** Drop strokes shorter than this (px). Text glyphs and ticks live here. */
  minLength: number;
  /** Parallel strokes spaced at most this far apart (px) may be hatching. */
  hatchMaxPitch: number;
  /** Hatch needs at least this many strokes in the lattice. */
  hatchMinCount?: number;
  /** A dimension string's run is at least this long (px). */
  dimMinLength: number;
  /** Its witness lines are at most this long (px). */
  dimMaxWitness: number;
}

export interface WallFilterResult {
  walls: Seg[];
  dropped: { short: number; hatch: number; dimension: number };
}

const lengthOf = (s: Seg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** Angle folded to [0, 180). */
const angleOf = (s: Seg) => {
  let a = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return a;
};

/**
 * Hatch: within a bucket of parallel strokes, sort by perpendicular offset
 * and look for runs of `minCount`+ strokes whose spacing is nearly constant
 * and no wider than `maxPitch`. Walls are parallel too, but a building has
 * a handful of them at irregular spacing; hatching has dozens at one pitch.
 */
const hatchIndexes = (segs: Seg[], maxPitch: number, minCount: number): Set<number> => {
  const out = new Set<number>();
  const buckets = new Map<number, number[]>();
  segs.forEach((s, i) => {
    const key = Math.round(angleOf(s) / 2); // 2° buckets
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(i);
  });
  for (const idx of buckets.values()) {
    if (idx.length < minCount) continue;
    // Perpendicular offset of each stroke from the origin.
    const a = (angleOf(segs[idx[0]]) * Math.PI) / 180;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const rows = idx
      .map((i) => ({ i, off: segs[i].x1 * nx + segs[i].y1 * ny, len: lengthOf(segs[i]) }))
      .sort((p, q) => p.off - q.off);
    let run: typeof rows = [rows[0]];
    let pitch = 0;
    const flush = () => {
      if (run.length >= minCount) for (const r of run) out.add(r.i);
    };
    for (let k = 1; k < rows.length; k++) {
      const gap = rows[k].off - rows[k - 1].off;
      const similarLen = rows[k].len < rows[k - 1].len * 2.5 && rows[k - 1].len < rows[k].len * 2.5;
      if (gap > 0.5 && gap <= maxPitch && similarLen && (pitch === 0 || Math.abs(gap - pitch) <= pitch * 0.25)) {
        if (pitch === 0) pitch = gap;
        run.push(rows[k]);
      } else {
        flush();
        run = [rows[k]];
        pitch = 0;
      }
    }
    flush();
  }
  return out;
};

/**
 * Dimension string: a long stroke with short strokes roughly perpendicular
 * to it whose ends touch it, near both of its ends (the witness lines). Grid
 * lines and dimension runs look alike from afar; the witnesses tell them
 * apart, and a wall never has them.
 */
const dimensionIndexes = (segs: Seg[], minLength: number, maxWitness: number): Set<number> => {
  const out = new Set<number>();
  const long: number[] = [];
  const shortIdx: number[] = [];
  segs.forEach((s, i) => {
    const l = lengthOf(s);
    if (l >= minLength) long.push(i);
    if (l <= maxWitness && l > 1) shortIdx.push(i);
  });
  if (long.length === 0 || shortIdx.length === 0) return out;

  // Bucket short-stroke endpoints for a cheap "who touches this run" query.
  const cell = Math.max(8, maxWitness);
  const grid = new Map<string, number[]>();
  const put = (x: number, y: number, i: number) => {
    const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    let b = grid.get(k);
    if (!b) grid.set(k, (b = []));
    b.push(i);
  };
  for (const i of shortIdx) {
    put(segs[i].x1, segs[i].y1, i);
    put(segs[i].x2, segs[i].y2, i);
  }

  const tol = 2.5;
  for (const li of long) {
    const L = segs[li];
    const dx = L.x2 - L.x1;
    const dy = L.y2 - L.y1;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const angL = angleOf(L);
    let nearStart = 0;
    let nearEnd = 0;
    const seen = new Set<number>();
    // Walk the run in cell steps and collect candidate short strokes.
    const steps = Math.ceil(len / cell) + 1;
    for (let k = 0; k <= steps; k++) {
      const t = Math.min(len, k * cell);
      const px = L.x1 + ux * t;
      const py = L.y1 + uy * t;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const b = grid.get(`${Math.floor(px / cell) + ox},${Math.floor(py / cell) + oy}`);
          if (!b) continue;
          for (const si of b) {
            if (seen.has(si)) continue;
            seen.add(si);
            const S = segs[si];
            let d = Math.abs(angleOf(S) - angL);
            if (d > 90) d = 180 - d;
            if (d < 70) continue; // not perpendicular enough
            // Does S cross L, or end on it, inside L's extent? Witness lines
            // usually run through the dimension line (a small overshoot each
            // side); sometimes they stop on it. Signed distances of S's two
            // ends tell: opposite signs = crossing, a near-zero one = touching.
            const r1x = S.x1 - L.x1;
            const r1y = S.y1 - L.y1;
            const r2x = S.x2 - L.x1;
            const r2y = S.y2 - L.y1;
            const d1 = r1x * uy - r1y * ux;
            const d2 = r2x * uy - r2y * ux;
            const touches = Math.abs(d1) <= tol || Math.abs(d2) <= tol;
            const crosses = d1 * d2 < 0;
            if (touches || crosses) {
              // Where along L the contact is: the endpoint that touches, or
              // the crossing point interpolated between the two ends.
              const f = crosses ? d1 / (d1 - d2) : Math.abs(d1) <= tol ? 0 : 1;
              const cx = r1x + (r2x - r1x) * f;
              const cy = r1y + (r2y - r1y) * f;
              const along = cx * ux + cy * uy;
              if (along >= -tol && along <= len + tol) {
                if (along < len * 0.35) nearStart++;
                if (along > len * 0.65) nearEnd++;
              }
            }
          }
        }
      }
    }
    if (nearStart > 0 && nearEnd > 0) out.add(li);
  }
  return out;
};

export const filterWallSegments = (segs: Seg[], opts: WallFilterOptions): WallFilterResult => {
  const minCount = opts.hatchMinCount ?? 5;
  const dropped = { short: 0, hatch: 0, dimension: 0 };
  const longEnough: Seg[] = [];
  for (const s of segs) {
    if (lengthOf(s) < opts.minLength) dropped.short++;
    else longEnough.push(s);
  }
  const hatch = hatchIndexes(longEnough, opts.hatchMaxPitch, minCount);
  const dims = dimensionIndexes(longEnough, opts.dimMinLength, opts.dimMaxWitness);
  const walls: Seg[] = [];
  longEnough.forEach((s, i) => {
    if (hatch.has(i)) dropped.hatch++;
    else if (dims.has(i)) dropped.dimension++;
    else walls.push(s);
  });
  return { walls, dropped };
};

/** Segment endpoints, de-duplicated to the pixel — the corners to snap to. */
export const cornerPoints = (segs: Seg[]): { x: number; y: number }[] => {
  const seen = new Set<string>();
  const out: { x: number; y: number }[] = [];
  const add = (x: number, y: number) => {
    const k = `${Math.round(x)},${Math.round(y)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, y });
  };
  for (const s of segs) {
    add(s.x1, s.y1);
    add(s.x2, s.y2);
  }
  return out;
};
