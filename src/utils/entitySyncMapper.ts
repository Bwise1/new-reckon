import type {
  BoqElementData,
  CalibrationLine,
  EstimationCardData,
  HistoryItem,
  Measurement,
  TakeoffItem,
  TakeoffMode,
  UnitType,
} from '@/types/takeoff';
import type {
  ApiBoqElement,
  ApiCalibration,
  ApiMeasurement,
  MeasurementCreateBody,
} from '@/services/entitySync.service';
import type { SyncOp } from '@/services/syncQueue';
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
      boqElementId: m.boq_element_id ?? undefined,
      boqItemId: m.boq_item_id ?? undefined,
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
    boq_element_id: measurement.boqElementId ?? null,
    boq_item_id: measurement.boqItemId ?? null,
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

// ---------- BOQ ----------

const VALID_UNITS = new Set<UnitType>(['m', 'm2', 'm3', 'nrs', 'item']);

const coerceUnit = (value: string | undefined): UnitType =>
  value && (VALID_UNITS as Set<string>).has(value) ? (value as UnitType) : 'm3';

export const boqElementsFromApiTree = (
  tree: ApiBoqElement[]
): BoqElementData[] => {
  const sortedElements = [...tree].sort((a, b) => a.sort_order - b.sort_order);
  return sortedElements.map((element) => {
    const items: EstimationCardData[] = [...element.items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => {
        const history: HistoryItem[] = [...item.history]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((h) => ({
            id: h.client_uuid,
            value: h.value,
            isDeduct: h.is_deduct,
            ...(h.source_measurement_client_uuid
              ? { sourceMeasurementId: h.source_measurement_client_uuid }
              : {}),
          }));
        return {
          id: item.client_uuid,
          unit: coerceUnit(item.unit),
          header: item.header ?? '',
          description: item.description ?? '',
          qty: item.qty ?? '0',
          rate: item.rate ?? '0',
          history,
        };
      });
    return {
      id: element.client_uuid,
      title: element.title,
      items,
    };
  });
};

/**
 * Compare the previous BOQ tree with the next and emit the minimum ops
 * required to bring the server in sync. Handles element/item/history
 * creation, update, and deletion. Called from the store on any BOQ
 * mutation (or after the whole tree changes at once — e.g. undo/redo).
 */
export const boqTreeOpsDiff = (
  projectId: string,
  before: BoqElementData[],
  after: BoqElementData[]
): SyncOp[] => {
  const ops: SyncOp[] = [];
  const beforeElementById = new Map(before.map((el) => [el.id, el]));
  const afterElementById = new Map(after.map((el) => [el.id, el]));

  // Element deletions.
  for (const [id, prevEl] of beforeElementById.entries()) {
    if (!afterElementById.has(id)) {
      ops.push({ kind: 'boq.element.delete', projectId, clientUuid: id });
      // Cascade-delete all items + history so the server stays clean.
      for (const item of prevEl.items) {
        ops.push({ kind: 'boq.item.delete', projectId, clientUuid: item.id });
        for (const h of item.history) {
          ops.push({ kind: 'boq.history.delete', projectId, clientUuid: h.id });
        }
      }
    }
  }

  // Element upserts + nested items/history diff.
  after.forEach((nextEl, elIdx) => {
    const prevEl = beforeElementById.get(nextEl.id);
    if (!prevEl || prevEl.title !== nextEl.title) {
      ops.push({
        kind: 'boq.element.upsert',
        projectId,
        clientUuid: nextEl.id,
        body: { title: nextEl.title, sort_order: elIdx },
      });
    } else if (before.indexOf(prevEl) !== elIdx) {
      // Sort order changed but title didn't — still upsert to bump order.
      ops.push({
        kind: 'boq.element.upsert',
        projectId,
        clientUuid: nextEl.id,
        body: { title: nextEl.title, sort_order: elIdx },
      });
    }

    const prevItemById = new Map(
      (prevEl?.items ?? []).map((it) => [it.id, it])
    );
    const nextItemById = new Map(nextEl.items.map((it) => [it.id, it]));

    // Item deletions.
    for (const [itemId, prevItem] of prevItemById.entries()) {
      if (!nextItemById.has(itemId)) {
        ops.push({ kind: 'boq.item.delete', projectId, clientUuid: itemId });
        for (const h of prevItem.history) {
          ops.push({ kind: 'boq.history.delete', projectId, clientUuid: h.id });
        }
      }
    }

    // Item upserts + history diff.
    nextEl.items.forEach((nextItem, itemIdx) => {
      const prevItem = prevItemById.get(nextItem.id);
      const itemChanged =
        !prevItem ||
        prevItem.unit !== nextItem.unit ||
        prevItem.header !== nextItem.header ||
        prevItem.description !== nextItem.description ||
        prevItem.qty !== nextItem.qty ||
        prevItem.rate !== nextItem.rate ||
        (prevEl?.items ?? []).indexOf(prevItem!) !== itemIdx;
      if (itemChanged) {
        ops.push({
          kind: 'boq.item.upsert',
          projectId,
          clientUuid: nextItem.id,
          body: {
            element_client_uuid: nextEl.id,
            sort_order: itemIdx,
            unit: nextItem.unit,
            header: nextItem.header,
            description: nextItem.description,
            qty: nextItem.qty,
            rate: nextItem.rate,
          },
        });
      }

      const prevHistoryById = new Map(
        (prevItem?.history ?? []).map((h) => [h.id, h])
      );
      const nextHistoryById = new Map(nextItem.history.map((h) => [h.id, h]));

      // History deletions.
      for (const hId of prevHistoryById.keys()) {
        if (!nextHistoryById.has(hId)) {
          ops.push({
            kind: 'boq.history.delete',
            projectId,
            clientUuid: hId,
          });
        }
      }

      // History upserts.
      nextItem.history.forEach((nextH, hIdx) => {
        const prevH = prevHistoryById.get(nextH.id);
        const historyChanged =
          !prevH ||
          prevH.value !== nextH.value ||
          Boolean(prevH.isDeduct) !== Boolean(nextH.isDeduct) ||
          (prevH.sourceMeasurementId ?? null) !==
            (nextH.sourceMeasurementId ?? null) ||
          (prevItem?.history ?? []).indexOf(prevH!) !== hIdx;
        if (historyChanged) {
          ops.push({
            kind: 'boq.history.upsert',
            projectId,
            clientUuid: nextH.id,
            body: {
              item_client_uuid: nextItem.id,
              sort_order: hIdx,
              value: nextH.value,
              is_deduct: Boolean(nextH.isDeduct),
              source_measurement_client_uuid: nextH.sourceMeasurementId ?? null,
            },
          });
        }
      });
    });
  });

  return ops;
};

/**
 * Full upload of the local BOQ tree to the server. Used only by the
 * one-shot migration when a project has never been synced. Emits one
 * upsert per row (elements → items → history) preserving all client_uuids.
 */
export const boqTreeToUpsertOps = (
  projectId: string,
  tree: BoqElementData[]
): SyncOp[] => boqTreeOpsDiff(projectId, [], tree);
