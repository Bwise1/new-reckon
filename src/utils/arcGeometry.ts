import type { Point } from "@/types/takeoff";

/**
 * Points along the circular arc that starts at `start`, ends at `end`, and
 * passes through `through` (the third "point on the curve" click). Returned
 * as a plain polyline with both endpoints included, so storage, sync, export,
 * and quantity math all treat an arc as an ordinary run of segments.
 * Collinear input degenerates to the straight chord.
 */
export function tessellateArc(start: Point, end: Point, through: Point): Point[] {
  const ax = start.x, ay = start.y;
  const bx = through.x, by = through.y;
  const cx = end.x, cy = end.y;

  // Circumcenter (perpendicular-bisector intersection).
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return [{ ...start }, { ...end }];
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ox = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const oy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ox, ay - oy);

  const angStart = Math.atan2(ay - oy, ax - ox);
  const angThrough = Math.atan2(by - oy, bx - ox);
  const angEnd = Math.atan2(cy - oy, cx - ox);

  // Sweep start→end in whichever direction passes through `through`.
  const ccw = (from: number, to: number) => {
    let s = to - from;
    while (s < 0) s += 2 * Math.PI;
    return s;
  };
  const sweepCcw = ccw(angStart, angEnd);
  const passesCcw = ccw(angStart, angThrough) <= sweepCcw;
  const sweep = passesCcw ? sweepCcw : sweepCcw - 2 * Math.PI;

  // ~8° per segment, clamped so tiny arcs stay light and near-full circles
  // stay smooth without bloating the stored point list.
  const steps = Math.min(64, Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 22.5))));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = angStart + (sweep * i) / steps;
    pts.push({ x: ox + r * Math.cos(t), y: oy + r * Math.sin(t) });
  }
  // Pin exact endpoints against float drift.
  pts[0] = { ...start };
  pts[pts.length - 1] = { ...end };
  return pts;
}
