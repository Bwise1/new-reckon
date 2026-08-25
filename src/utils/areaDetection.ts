/**
 * Single-click area detection: flood-fill the enclosed region around a click
 * and return its boundary as a polygon. See docs/single-click-area.md.
 *
 * Everything here works in the pixel space of the ImageData it is given — the
 * caller decides resolution (typically a downscaled copy of the plan bitmap
 * with the extracted vector wall segments stroked on top) and converts the
 * returned polygon back to measurement space.
 */

export interface DetectedPolygon {
  /** Boundary vertices in input-pixel coordinates, in order. */
  points: { x: number; y: number }[];
  /** Filled pixels — for confidence/telemetry. */
  filledPixels: number;
}

export interface DetectOptions {
  /** Pixels with luminance BELOW this are walls (0-255). */
  wallThreshold?: number;
  /** Abort if the fill exceeds this fraction of the image (leak guard). */
  maxAreaFraction?: number;
  /** Ramer-Douglas-Peucker tolerance in pixels. */
  epsilon?: number;
}

const luminance = (data: Uint8ClampedArray, idx: number): number =>
  0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

/**
 * Scanline flood fill + Moore boundary trace + RDP simplify.
 * Returns null when the click lands on a wall pixel or the fill leaks past
 * the area guard (an unbounded region — a gap in the walls).
 */
export function detectRoomPolygon(
  image: ImageData,
  startX: number,
  startY: number,
  options: DetectOptions = {}
): DetectedPolygon | null {
  const { wallThreshold = 180, maxAreaFraction = 0.5, epsilon = 2.5 } = options;
  const { width, height, data } = image;
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

  const isInterior = (x: number, y: number): boolean =>
    luminance(data, (y * width + x) * 4) >= wallThreshold;

  if (!isInterior(sx, sy)) return null; // clicked on a line

  const filled = new Uint8Array(width * height);
  const maxFill = Math.floor(width * height * maxAreaFraction);
  let filledCount = 0;

  // Scanline fill with an explicit stack (recursion would blow on big rooms).
  const stack: number[] = [sx, sy];
  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (filled[y * width + x] || !isInterior(x, y)) continue;

    let xL = x;
    while (xL > 0 && !filled[y * width + xL - 1] && isInterior(xL - 1, y)) xL--;
    let xR = x;
    while (xR < width - 1 && !filled[y * width + xR + 1] && isInterior(xR + 1, y)) xR++;

    for (let i = xL; i <= xR; i++) filled[y * width + i] = 1;
    filledCount += xR - xL + 1;
    if (filledCount > maxFill) return null; // leaked out of the room

    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let i = xL; i <= xR; i++) {
        const open = !filled[ny * width + i] && isInterior(i, ny);
        // Push one seed per contiguous run instead of every pixel.
        if (open && !inRun) {
          stack.push(i, ny);
          inRun = true;
        } else if (!open) {
          inRun = false;
        }
      }
    }
  }

  // Reject tiny accidental fills (a click inside a letter "o").
  if (filledCount < 64) return null;

  const boundary = traceBoundary(filled, width, height);
  if (!boundary || boundary.length < 8) return null;

  const simplified = simplifyClosed(boundary, epsilon);
  if (simplified.length < 3) return null;

  return { points: simplified, filledPixels: filledCount };
}

/** Moore-neighbour boundary trace of the filled mask (outer contour). */
function traceBoundary(
  mask: Uint8Array,
  width: number,
  height: number
): { x: number; y: number }[] | null {
  // Find the topmost-leftmost filled pixel; its left neighbour is background.
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

  const contour: { x: number; y: number }[] = [];
  let cx = sx;
  let cy = sy;
  // The backtrack starts at the (background) pixel we "entered" from — W.
  let backtrack = 0;
  const maxSteps = 4 * (width + height) * 8; // generous perimeter cap

  for (let step = 0; step < maxSteps; step++) {
    contour.push({ x: cx, y: cy });
    let found = false;
    // Search clockwise from the pixel after the backtrack direction.
    for (let i = 1; i <= 8; i++) {
      const dir = (backtrack + i) % 8;
      const nx = cx + N8[dir][0];
      const ny = cy + N8[dir][1];
      if (inMask(nx, ny)) {
        // New backtrack: the direction pointing back toward the previous
        // background pixel (one step counter-clockwise of where we found it).
        backtrack = (dir + 5) % 8;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) return contour; // isolated pixel
    if (cx === sx && cy === sy && contour.length > 2) return contour;
  }
  return contour;
}

/** RDP on a closed loop: anchor at the two most distant vertices, simplify
 *  both halves, and stitch. */
function simplifyClosed(
  points: { x: number; y: number }[],
  epsilon: number
): { x: number; y: number }[] {
  if (points.length <= 4) return points;
  // Cheap far-pair: point most distant from points[0].
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

function rdp(
  points: { x: number; y: number }[],
  epsilon: number
): { x: number; y: number }[] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let index = 0;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const dist =
      Math.abs(dy * points[i].x - dx * points[i].y + last.x * first.y - last.y * first.x) /
      len;
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
