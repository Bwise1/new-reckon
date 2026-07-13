import type {
  CalibrationLine,
  Measurement,
  TakeoffItem,
  TakeoffMode,
} from '@/types/takeoff';
import type {
  ApiCalibration,
  ApiMeasurement,
  MeasurementCreateBody,
} from '@/services/entitySync.service';
import {
  CANVAS_TAKEOFF_ITEM_ID,
  unitForTakeoffMode,
} from '@/utils/takeoffMeasurement';
import { MARKUP_COLORS } from '@/constants/takeoffDesign';

// ---------- Calibration ----------

/**
 * Fold a list of server calibrations into the store's plan-keyed structure.
 * Server returns rows keyed by (plan_client_uuid, page); the store keeps
 * per-plan `PlanDocumentState` with `scales[page]` and `calibrationLines[page]`.
 */
export const mergeApiCalibrations = (
  planStates: Record<string, {
    scales: Record<number, number>;
    calibrationLines: Record<number, CalibrationLine>;
    numPages: number;
    currentPage: number;
    backgroundImage: string | null;
  }>,
  apiCalibrations: ApiCalibration[]
): typeof planStates => {
  const next: typeof planStates = { ...planStates };
  for (const cal of apiCalibrations) {
    const existing = next[cal.plan_client_uuid] ?? {
      scales: {},
      calibrationLines: {},
      numPages: 0,
      currentPage: 1,
      backgroundImage: null,
    };
    next[cal.plan_client_uuid] = {
      ...existing,
      scales: { ...existing.scales, [cal.page]: cal.scale_pixels_per_meter },
      calibrationLines: {
        ...existing.calibrationLines,
        [cal.page]: {
          p1: { x: cal.p1_x, y: cal.p1_y },
          p2: { x: cal.p2_x, y: cal.p2_y },
          distance: cal.distance_meters,
        },
      },
    };
  }
  return next;
};

export const calibrationUpsertBodyFromStore = (
  scale: number,
  line: CalibrationLine
) => ({
  scale_pixels_per_meter: scale,
  p1_x: line.p1.x,
  p1_y: line.p1.y,
  p2_x: line.p2.x,
  p2_y: line.p2.y,
  distance_meters: line.distance,
});

// ---------- Measurement ----------

const isTakeoffMode = (value: string): value is TakeoffMode =>
  value === 'linear' || value === 'polyline' || value === 'area' || value === 'count';

/**
 * Convert server measurements into the store's TakeoffItem[] shape by
 * grouping by takeoff_item_client_uuid. Everything not attached to a real
 * item id falls back into the canvas item (matches the current single-item
 * model where all markups live under __reckon_canvas__).
 */
export const takeoffItemsFromApiMeasurements = (
  measurements: ApiMeasurement[]
): TakeoffItem[] => {
  const groups = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const type: TakeoffMode = isTakeoffMode(m.type) ? m.type : 'linear';
    const measurement: Measurement = {
      id: m.client_uuid,
      points: Array.isArray(m.points) ? m.points : [],
      quantity: m.quantity,
      planId: m.plan_client_uuid,
      page: m.page,
      type,
      color: m.color,
      hidden: m.hidden,
      metadata:
        m.metadata && (m.metadata.createdAt || m.metadata.lastModified)
          ? {
              createdAt: m.metadata.createdAt ?? new Date().toISOString(),
              lastModified:
                m.metadata.lastModified ?? new Date().toISOString(),
              confidence: m.metadata.confidence,
            }
          : undefined,
    };
    const itemId = m.takeoff_item_client_uuid || CANVAS_TAKEOFF_ITEM_ID;
    const list = groups.get(itemId);
    if (list) list.push(measurement);
    else groups.set(itemId, [measurement]);
  }

  const items: TakeoffItem[] = [];
  for (const [itemId, list] of groups.entries()) {
    // Take type/color/unit from the first measurement; the store treats
    // per-measurement type/color as authoritative anyway.
    const first = list[0];
    const type: TakeoffMode = first?.type ?? 'linear';
    const color = first?.color ?? MARKUP_COLORS[0];
    const totalQuantity = list.reduce((sum, m) => sum + (m.quantity ?? 0), 0);
    items.push({
      id: itemId,
      name: itemId === CANVAS_TAKEOFF_ITEM_ID ? 'Canvas markups' : itemId,
      type,
      color,
      measurements: list,
      totalQuantity,
      unit: unitForTakeoffMode(type),
    });
  }
  return items;
};

/**
 * Extract a `MeasurementCreateBody` for the server from a store measurement.
 */
export const measurementCreateBodyFromStore = (
  itemId: string,
  planId: string,
  measurement: Measurement
): MeasurementCreateBody | null => {
  if (!measurement.planId && !planId) return null;
  const type: TakeoffMode | undefined = measurement.type;
  if (!type) return null;
  return {
    client_uuid: measurement.id,
    plan_client_uuid: measurement.planId ?? planId,
    takeoff_item_client_uuid: itemId,
    page: measurement.page,
    type,
    color: measurement.color ?? MARKUP_COLORS[0],
    points: measurement.points,
    quantity: measurement.quantity,
    hidden: Boolean(measurement.hidden),
    metadata: measurement.metadata
      ? {
          createdAt: measurement.metadata.createdAt,
          lastModified: measurement.metadata.lastModified,
          confidence: measurement.metadata.confidence,
        }
      : null,
  };
};
