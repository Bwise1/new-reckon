import type { Measurement, TakeoffItem, TakeoffMode } from '@/types/takeoff';

export const CANVAS_TAKEOFF_ITEM_ID = '__reckon_canvas__';

export const getMeasurementType = (measurement: Measurement, item: TakeoffItem): TakeoffMode =>
  measurement.type ?? item.type;

export const getMeasurementColor = (measurement: Measurement, item: TakeoffItem): string =>
  measurement.color ?? item.color;

export const unitForTakeoffMode = (type: TakeoffMode): string =>
  type === 'area' ? 'm2' : type === 'count' ? 'ea' : 'm';

/** Backfill per-measurement type/color from legacy layer-level fields, and
 *  assign a stable per-type `seq` to any measurement missing one (so legacy
 *  data drawn before naming existed shows "Area 1", "Perimeter 2", … instead
 *  of a bare "Area"/"Perimeter"). Existing seq values are preserved; new ones
 *  continue from the current per-type max so numbers never collide. */
export const normalizeTakeoffItems = (items: TakeoffItem[]): TakeoffItem[] => {
  // Start each per-type counter at the highest seq already present.
  const nextByType: Record<string, number> = {};
  for (const item of items) {
    for (const m of item.measurements) {
      const t = m.type ?? item.type;
      if (typeof m.seq === 'number') {
        nextByType[t] = Math.max(nextByType[t] ?? 0, m.seq);
      }
    }
  }
  return items.map((item) => ({
    ...item,
    measurements: item.measurements.map((measurement) => {
      const type = measurement.type ?? item.type;
      let seq = measurement.seq;
      if (typeof seq !== 'number') {
        seq = (nextByType[type] ?? 0) + 1;
        nextByType[type] = seq;
      }
      return {
        ...measurement,
        type,
        color: measurement.color ?? item.color,
        seq,
      };
    }),
  }));
};

export const isCanvasTakeoffItem = (item: TakeoffItem): boolean =>
  item.id === CANVAS_TAKEOFF_ITEM_ID;

/** Human name for a measurement type, used as the auto-label prefix. */
export const typeName = (type: TakeoffMode): string => {
  switch (type) {
    case 'area':
      return 'Area';
    case 'polyline':
      return 'Perimeter';
    case 'count':
      return 'Count';
    case 'linear':
    default:
      return 'Linear';
  }
};

/**
 * The next stable sequence number for a given type across ALL measurements.
 * Uses the max existing seq for that type + 1 so numbers are never reused
 * (deleting "Area 2" leaves a gap; the next new area is still max+1).
 */
export const nextSeqForType = (items: TakeoffItem[], type: TakeoffMode): number => {
  let max = 0;
  for (const item of items) {
    for (const m of item.measurements) {
      const mType = m.type ?? item.type;
      if (mType === type && typeof m.seq === 'number' && m.seq > max) {
        max = m.seq;
      }
    }
  }
  return max + 1;
};

/**
 * Display label for a measurement row: the user's custom name if set,
 * otherwise the auto "Area 3" style label from type + stable seq. Falls back
 * to just the type name when seq is missing (legacy measurements).
 */
export const measurementLabel = (
  measurement: Measurement,
  type: TakeoffMode
): string => {
  if (measurement.name && measurement.name.trim()) return measurement.name.trim();
  const prefix = typeName(type);
  return typeof measurement.seq === 'number' ? `${prefix} ${measurement.seq}` : prefix;
};

/**
 * Derive the canonical linear-family type from the current point count.
 * Called after any edit that mutates a measurement's points so a 'linear'
 * with 3+ points auto-converts to 'polyline' and vice versa. Only
 * meaningful for linear/polyline; other types are returned unchanged.
 */
export const deriveMeasurementType = (
  currentType: TakeoffMode,
  pointCount: number
): TakeoffMode => {
  if (currentType !== 'linear' && currentType !== 'polyline') return currentType;
  return pointCount >= 3 ? 'polyline' : 'linear';
};
