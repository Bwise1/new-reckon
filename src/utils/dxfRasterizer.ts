// Rasterize a DXF drawing into a PNG data URL that the canvas can render as a
// plan background — the same HTMLImageElement path used for PDF/PNG plans, so
// all takeoff tools and calibration work on it unchanged.
//
// Scope: renders the geometry that matters for takeoff — LINE, LWPOLYLINE /
// POLYLINE, CIRCLE, ARC, and (approximate) ELLIPSE/SPLINE as polylines. Text,
// hatches, blocks with complex styling, and xrefs are not fully rendered.
// DWG is NOT supported (proprietary binary) — users export to DXF first.

// Parser is loaded lazily by the caller via dynamic import so it never lands
// in the main bundle.
type Vec = { x: number; y: number };

interface DxfRasterResult {
  dataUrl: string;
  width: number;
  height: number;
}

const PADDING = 20; // px border around the drawing
const MAX_DIM = 4000; // cap the raster so huge drawings don't blow up memory
const MIN_DIM = 400;

// Collect drawable polylines (arrays of points) from parsed DXF entities.
function entitiesToPolylines(entities: any[]): Vec[][] {
  const polylines: Vec[][] = [];
  const arcToPoints = (
    cx: number,
    cy: number,
    r: number,
    startDeg: number,
    endDeg: number
  ): Vec[] => {
    const pts: Vec[] = [];
    let a0 = (startDeg * Math.PI) / 180;
    let a1 = (endDeg * Math.PI) / 180;
    if (a1 < a0) a1 += Math.PI * 2;
    const steps = Math.max(8, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 64));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  };

  for (const e of entities || []) {
    switch (e.type) {
      case 'LINE': {
        if (e.vertices?.length >= 2) {
          polylines.push([
            { x: e.vertices[0].x, y: e.vertices[0].y },
            { x: e.vertices[1].x, y: e.vertices[1].y },
          ]);
        } else if (e.start && e.end) {
          polylines.push([
            { x: e.start.x, y: e.start.y },
            { x: e.end.x, y: e.end.y },
          ]);
        }
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const verts = (e.vertices || []).map((v: any) => ({ x: v.x, y: v.y }));
        if (verts.length >= 2) {
          if (e.shape || e.closed) verts.push(verts[0]);
          polylines.push(verts);
        }
        break;
      }
      case 'CIRCLE': {
        if (e.center && typeof e.radius === 'number') {
          polylines.push(arcToPoints(e.center.x, e.center.y, e.radius, 0, 360));
        }
        break;
      }
      case 'ARC': {
        if (e.center && typeof e.radius === 'number') {
          polylines.push(
            arcToPoints(
              e.center.x,
              e.center.y,
              e.radius,
              e.startAngle ?? 0,
              e.endAngle ?? 360
            )
          );
        }
        break;
      }
      case 'ELLIPSE':
      case 'SPLINE': {
        // Approximate: use control/fit points as a polyline if present.
        const verts = (e.controlPoints || e.fitPoints || e.vertices || []).map(
          (v: any) => ({ x: v.x, y: v.y })
        );
        if (verts.length >= 2) polylines.push(verts);
        break;
      }
      default:
        break;
    }
  }
  return polylines;
}

/**
 * Parse DXF text and rasterize to a PNG data URL. Throws if the DXF has no
 * drawable geometry (so the caller can show a clear error).
 */
export async function rasterizeDxf(dxfText: string): Promise<DxfRasterResult> {
  // Lazy-load the parser so it stays out of the main bundle.
  const { default: DxfParser } = await import('dxf-parser');
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf) throw new Error('DXF could not be parsed.');

  const polylines = entitiesToPolylines(dxf.entities as any[]);
  if (polylines.length === 0) {
    throw new Error('No drawable geometry found in this DXF.');
  }

  // Bounding box across all points (DXF Y is up; we flip to screen Y-down).
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pl of polylines) {
    for (const p of pl) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const dwgW = maxX - minX;
  const dwgH = maxY - minY;
  if (!Number.isFinite(dwgW) || !Number.isFinite(dwgH) || dwgW <= 0 || dwgH <= 0) {
    throw new Error('DXF geometry has no measurable extent.');
  }

  // Scale so the longer side maps to MAX_DIM (but not below MIN_DIM).
  const rawScale = MAX_DIM / Math.max(dwgW, dwgH);
  const scale = Math.max(rawScale, MIN_DIM / Math.max(dwgW, dwgH));
  const width = Math.min(MAX_DIM, Math.max(MIN_DIM, Math.ceil(dwgW * scale) + PADDING * 2));
  const height = Math.min(MAX_DIM, Math.max(MIN_DIM, Math.ceil(dwgH * scale) + PADDING * 2));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a canvas to render the DXF.');

  // White background (matches how plans read on the canvas).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Map a DXF point to canvas px: shift to origin, scale, flip Y, pad.
  const tx = (x: number) => PADDING + (x - minX) * scale;
  const ty = (y: number) => height - PADDING - (y - minY) * scale;

  for (const pl of polylines) {
    ctx.beginPath();
    let started = false;
    for (const p of pl) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const cx = tx(p.x);
      const cy = ty(p.y);
      if (!started) {
        ctx.moveTo(cx, cy);
        started = true;
      } else {
        ctx.lineTo(cx, cy);
      }
    }
    ctx.stroke();
  }

  return { dataUrl: canvas.toDataURL('image/png'), width, height };
}

/** True when a file looks like a DXF (there is no reliable DXF MIME type). */
export function isDxfFile(file: { name?: string; type?: string }): boolean {
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return (
    name.endsWith('.dxf') ||
    type === 'application/dxf' ||
    type === 'image/vnd.dxf' ||
    type === 'application/x-dxf'
  );
}
