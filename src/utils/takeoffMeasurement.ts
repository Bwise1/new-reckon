import type { Measurement, TakeoffItem, TakeoffMode } from '@/types/takeoff';

export const CANVAS_TAKEOFF_ITEM_ID = '__reckon_canvas__';

export const getMeasurementType = (measurement: Measurement, item: TakeoffItem): TakeoffMode =>
  measurement.type ?? item.type;

export const getMeasurementColor = (measurement: Measurement, item: TakeoffItem): string =>
  measurement.color ?? item.color;

export const unitForTakeoffMode = (type: TakeoffMode): string =>
  type === 'area' ? 'm2' : type === 'count' ? 'ea' : 'm';

/** Backfill per-measurement type/color from legacy layer-level fields. */
export const normalizeTakeoffItems = (items: TakeoffItem[]): TakeoffItem[] =>
  items.map((item) => ({
    ...item,
    measurements: item.measurements.map((measurement) => ({
      ...measurement,
      type: measurement.type ?? item.type,
      color: measurement.color ?? item.color,
    })),
  }));

export const isCanvasTakeoffItem = (item: TakeoffItem): boolean =>
  item.id === CANVAS_TAKEOFF_ITEM_ID;
