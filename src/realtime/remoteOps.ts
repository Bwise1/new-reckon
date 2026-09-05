import type { RemoteOp } from '@/realtime/types';
import type { ApiMeasurement } from '@/services/entitySync.service';
import type { PlanDocumentState } from '@/utils/planDocument';
import { emptyPlanDocumentState } from '@/utils/planDocument';
import { takeoffItemsFromApiMeasurements } from '@/utils/entitySyncMapper';
import type {
  BoqBillData,
  BoqElementData,
  CalibrationLine,
  EstimationCardData,
  HistoryItem,
  Measurement,
  Point,
  TakeoffItem,
  TakeoffMode,
} from '@/types/takeoff';
import { CANVAS_TAKEOFF_ITEM_ID } from '@/utils/takeoffMeasurement';

/**
 * Pure reducers that fold a remote `op` (another client's landed mutation)
 * into takeoff-store state. Bodies are the server-shaped REST bodies the
 * sender used, so they are parsed defensively — an op we cannot make sense
 * of is ignored, never half-applied.
 */

export type RemoteOpSlice = {
  takeoffItems: TakeoffItem[];
  activePlanId: string | null;
  planStates: Record<string, PlanDocumentState>;
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  bills: BoqBillData[];
  activeBillId: string | null;
  billElements: Record<string, BoqElementData[]>;
  boqElements: BoqElementData[];
};

// ---------- tiny value readers ----------

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const has = (body: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(body, key);

const isPoint = (v: unknown): v is Point => {
  const r = asRecord(v);
  return !!r && typeof r.x === 'number' && typeof r.y === 'number';
};
const pointsFrom = (v: unknown): Point[] | undefined =>
  Array.isArray(v) && v.every(isPoint) ? v.map((p) => ({ x: p.x, y: p.y })) : undefined;
const deductionsFrom = (v: unknown): Point[][] | null | undefined => {
  if (v === null) return null;
  if (!Array.isArray(v)) return undefined;
  const out: Point[][] = [];
  for (const ring of v) {
    const pts = pointsFrom(ring);
    if (!pts) return undefined;
    out.push(pts);
  }
  return out;
};
const isTakeoffMode = (v: unknown): v is TakeoffMode =>
  v === 'linear' || v === 'polyline' || v === 'area' || v === 'count';

const sumQuantity = (measurements: Measurement[]) =>
  measurements.reduce((sum, m) => sum + (m.quantity ?? 0), 0);

const withTotal = (item: TakeoffItem, measurements: Measurement[]): TakeoffItem => ({
  ...item,
  measurements,
  totalQuantity: sumQuantity(measurements),
});

const insertAt = <T>(list: T[], value: T, index: number | undefined): T[] => {
  const next = [...list];
  const at = index === undefined ? next.length : Math.max(0, Math.min(next.length, index));
  next.splice(at, 0, value);
  return next;
};

// ---------- measurements ----------

const apiMeasurementFromOp = (op: RemoteOp): ApiMeasurement | null => {
  const body = asRecord(op.body);
  if (!body) return null;
  const points = pointsFrom(body.points);
  const type = body.type;
  const page = num(body.page);
  const planUuid = str(body.plan_client_uuid);
  if (!points || !isTakeoffMode(type) || page === undefined || !planUuid) return null;
  const metadata = asRecord(body.metadata);
  return {
    client_uuid: str(body.client_uuid) ?? op.clientUuid,
    project_id: op.projectId,
    plan_client_uuid: planUuid,
    takeoff_item_client_uuid: str(body.takeoff_item_client_uuid) ?? CANVAS_TAKEOFF_ITEM_ID,
    boq_element_id: str(body.boq_element_id) ?? null,
    boq_item_id: str(body.boq_item_id) ?? null,
    page,
    type,
    color: str(body.color) ?? '',
    points,
    deductions: deductionsFrom(body.deductions) ?? null,
    quantity: num(body.quantity) ?? 0,
    hidden: bool(body.hidden) ?? false,
    metadata: metadata
      ? {
          createdAt: str(metadata.createdAt),
          lastModified: str(metadata.lastModified),
          confidence: num(metadata.confidence),
          strokeWidth: num(metadata.strokeWidth),
          name: str(metadata.name),
          seq: num(metadata.seq),
          arc: bool(metadata.arc),
          sectionGroupId: str(metadata.sectionGroupId),
        }
      : null,
  };
};

const applyMeasurementCreate = (items: TakeoffItem[], op: RemoteOp): TakeoffItem[] | null => {
  const api = apiMeasurementFromOp(op);
  if (!api) return null;
  const [incoming] = takeoffItemsFromApiMeasurements([api]);
  const measurement = incoming?.measurements[0];
  if (!incoming || !measurement) return null;
  // The same uuid may already exist (a re-broadcast, or an update that beat
  // its create) — replace, never duplicate.
  const stripped = items.map((item) => {
    if (!item.measurements.some((m) => m.id === measurement.id)) return item;
    return withTotal(item, item.measurements.filter((m) => m.id !== measurement.id));
  });
  const existing = stripped.find((item) => item.id === incoming.id);
  if (existing) {
    return stripped.map((item) =>
      item.id === existing.id ? withTotal(item, [...item.measurements, measurement]) : item
    );
  }
  return [...stripped, incoming];
};

const patchMeasurement = (m: Measurement, body: Record<string, unknown>): Measurement => {
  let next: Measurement = { ...m };
  const points = pointsFrom(body.points);
  if (points) next.points = points;
  if (has(body, 'deductions')) {
    const d = deductionsFrom(body.deductions);
    if (d === null) delete next.deductions;
    else if (d !== undefined) next.deductions = d.length > 0 ? d : undefined;
  }
  const quantity = num(body.quantity);
  if (quantity !== undefined) next.quantity = quantity;
  const color = str(body.color);
  if (color) next.color = color;
  const hidden = bool(body.hidden);
  if (hidden !== undefined) next.hidden = hidden;
  const page = num(body.page);
  if (page !== undefined) next.page = page;
  if (isTakeoffMode(body.type)) next.type = body.type;
  if (has(body, 'boq_element_id')) {
    const v = str(body.boq_element_id);
    if (v) next.boqElementId = v;
    else delete next.boqElementId;
  }
  if (has(body, 'boq_item_id')) {
    const v = str(body.boq_item_id);
    if (v) next.boqItemId = v;
    else delete next.boqItemId;
  }
  // The server stores the metadata blob wholesale, so a present blob is the
  // complete truth for every field it carries.
  const meta = asRecord(body.metadata);
  if (meta) {
    const { strokeWidth: _sw, name: _n, seq: _s, arc: _a, sectionGroupId: _g, ...rest } = next;
    void _sw; void _n; void _s; void _a; void _g;
    next = rest as Measurement;
    const strokeWidth = num(meta.strokeWidth);
    if (strokeWidth !== undefined) next.strokeWidth = strokeWidth;
    const name = str(meta.name);
    if (name !== undefined) next.name = name;
    const seq = num(meta.seq);
    if (seq !== undefined) next.seq = seq;
    if (meta.arc === true) next.arc = true;
    const group = str(meta.sectionGroupId);
    if (group) next.sectionGroupId = group;
    const createdAt = str(meta.createdAt);
    const lastModified = str(meta.lastModified);
    if (createdAt || lastModified) {
      next.metadata = {
        createdAt: createdAt ?? m.metadata?.createdAt ?? new Date().toISOString(),
        lastModified: lastModified ?? m.metadata?.lastModified ?? new Date().toISOString(),
        confidence: num(meta.confidence),
      };
    }
  }
  return next;
};

const applyMeasurementUpdate = (items: TakeoffItem[], op: RemoteOp): TakeoffItem[] | null => {
  const body = asRecord(op.body);
  if (!body) return null;
  let found = false;
  const next = items.map((item) => {
    if (!item.measurements.some((m) => m.id === op.clientUuid)) return item;
    found = true;
    return withTotal(
      item,
      item.measurements.map((m) => (m.id === op.clientUuid ? patchMeasurement(m, body) : m))
    );
  });
  if (found) return next;
  // Unknown uuid: if the body is a full row (some servers broadcast the
  // updated row rather than the patch), treat it as a create.
  return applyMeasurementCreate(items, op);
};

const applyMeasurementDelete = (items: TakeoffItem[], op: RemoteOp): TakeoffItem[] | null => {
  let found = false;
  const next = items.map((item) => {
    if (!item.measurements.some((m) => m.id === op.clientUuid)) return item;
    found = true;
    return withTotal(item, item.measurements.filter((m) => m.id !== op.clientUuid));
  });
  return found ? next : null;
};

// ---------- calibration ----------

/**
 * The sync queue keys calibrations by (planUuid, page), not a client uuid.
 * Accept the pair from the body (`plan_client_uuid` + `page`) and fall back to
 * a `planUuid:page` clientUuid.
 */
const calibrationTarget = (op: RemoteOp): { planUuid: string; page: number } | null => {
  const body = asRecord(op.body);
  const [uuidPart, pagePart] = (op.clientUuid ?? '').split(':');
  const planUuid = str(body?.plan_client_uuid) ?? str(body?.planUuid) ?? (uuidPart || undefined);
  const page = num(body?.page) ?? num(pagePart);
  if (!planUuid || page === undefined) return null;
  return { planUuid, page };
};

const calibrationFromBody = (body: Record<string, unknown>): { scale: number; line: CalibrationLine } | null => {
  const scale = num(body.scale_pixels_per_meter);
  const p1x = num(body.p1_x), p1y = num(body.p1_y), p2x = num(body.p2_x), p2y = num(body.p2_y);
  const distance = num(body.distance_meters);
  if (scale === undefined || p1x === undefined || p1y === undefined || p2x === undefined || p2y === undefined || distance === undefined) {
    return null;
  }
  return { scale, line: { p1: { x: p1x, y: p1y }, p2: { x: p2x, y: p2y }, distance } };
};

const applyCalibration = (state: RemoteOpSlice, op: RemoteOp, remove: boolean): Partial<RemoteOpSlice> | null => {
  const target = calibrationTarget(op);
  if (!target) return null;
  const body = asRecord(op.body);
  const value = remove ? null : body ? calibrationFromBody(body) : null;
  if (!remove && !value) return null;

  const doc = state.planStates[target.planUuid] ?? emptyPlanDocumentState();
  const scales = { ...doc.scales };
  const calibrationLines = { ...doc.calibrationLines };
  if (value) {
    scales[target.page] = value.scale;
    calibrationLines[target.page] = value.line;
  } else {
    delete scales[target.page];
    delete calibrationLines[target.page];
  }
  const patch: Partial<RemoteOpSlice> = {
    planStates: { ...state.planStates, [target.planUuid]: { ...doc, scales, calibrationLines } },
  };
  // The flat scales/calibrationLines mirror the ACTIVE plan and are what the
  // canvas reads (currentScale = scales[currentPage]) — same path setScale
  // takes, so the sheet re-renders with the new scale immediately.
  if (state.activePlanId === target.planUuid) {
    const flatScales = { ...state.scales };
    const flatLines = { ...state.calibrationLines };
    if (value) {
      flatScales[target.page] = value.scale;
      flatLines[target.page] = value.line;
    } else {
      delete flatScales[target.page];
      delete flatLines[target.page];
    }
    patch.scales = flatScales;
    patch.calibrationLines = flatLines;
  }
  return patch;
};

// ---------- BOQ ----------

const ACTIVE_KEY = '__active__';

/** Every bill's element tree in one map (the active bill's lives in boqElements). */
const treesOf = (state: RemoteOpSlice): Record<string, BoqElementData[]> => ({
  ...state.billElements,
  [state.activeBillId ?? ACTIVE_KEY]: state.boqElements,
});

const treesToPatch = (state: RemoteOpSlice, trees: Record<string, BoqElementData[]>): Partial<RemoteOpSlice> => {
  const activeKey = state.activeBillId ?? ACTIVE_KEY;
  const billElements: Record<string, BoqElementData[]> = {};
  for (const [billId, tree] of Object.entries(trees)) {
    if (billId !== activeKey) billElements[billId] = tree;
  }
  return { boqElements: trees[activeKey] ?? [], billElements };
};

const findElementBill = (trees: Record<string, BoqElementData[]>, elementId: string): string | undefined =>
  Object.keys(trees).find((billId) => trees[billId].some((el) => el.id === elementId));

const findItemLocation = (
  trees: Record<string, BoqElementData[]>,
  itemId: string
): { billId: string; elementId: string } | undefined => {
  for (const [billId, tree] of Object.entries(trees)) {
    for (const el of tree) {
      if (el.items.some((it) => it.id === itemId)) return { billId, elementId: el.id };
    }
  }
  return undefined;
};

const findHistoryLocation = (
  trees: Record<string, BoqElementData[]>,
  historyId: string
): { billId: string; elementId: string; itemId: string } | undefined => {
  for (const [billId, tree] of Object.entries(trees)) {
    for (const el of tree) {
      for (const it of el.items) {
        if (it.history.some((h) => h.id === historyId)) return { billId, elementId: el.id, itemId: it.id };
      }
    }
  }
  return undefined;
};

const mapTree = (
  trees: Record<string, BoqElementData[]>,
  billId: string,
  fn: (tree: BoqElementData[]) => BoqElementData[]
): Record<string, BoqElementData[]> => ({ ...trees, [billId]: fn(trees[billId] ?? []) });

const applyBillUpsert = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  const body = asRecord(op.body);
  const name = str(body?.name);
  if (!name) return null;
  const sortOrder = num(body?.sort_order);
  const exists = state.bills.some((b) => b.id === op.clientUuid);
  let bills = exists
    ? state.bills.map((b) => (b.id === op.clientUuid ? { ...b, name } : b))
    : insertAt(state.bills, { id: op.clientUuid, name }, sortOrder);
  if (exists && sortOrder !== undefined) {
    const bill = bills.find((b) => b.id === op.clientUuid);
    if (bill) bills = insertAt(bills.filter((b) => b.id !== op.clientUuid), bill, sortOrder);
  }
  const patch: Partial<RemoteOpSlice> = { bills };
  if (!exists) {
    if (state.activeBillId === null) patch.activeBillId = op.clientUuid;
    else patch.billElements = { ...state.billElements, [op.clientUuid]: state.billElements[op.clientUuid] ?? [] };
  }
  return patch;
};

const applyBillDelete = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  if (!state.bills.some((b) => b.id === op.clientUuid)) return null;
  const bills = state.bills.filter((b) => b.id !== op.clientUuid);
  const billElements = { ...state.billElements };
  delete billElements[op.clientUuid];
  if (state.activeBillId !== op.clientUuid) return { bills, billElements };
  // The bill we are looking at was deleted elsewhere: fall back to the first
  // remaining one (or an empty tree when none is left).
  const nextActive = bills[0]?.id ?? null;
  const boqElements = nextActive ? (billElements[nextActive] ?? []) : [];
  if (nextActive) delete billElements[nextActive];
  return { bills, billElements, activeBillId: nextActive, boqElements };
};

const applyElementUpsert = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  const body = asRecord(op.body);
  const title = str(body?.title);
  if (title === undefined) return null;
  const sortOrder = num(body?.sort_order);
  let trees = treesOf(state);
  const currentBill = findElementBill(trees, op.clientUuid);
  const targetBill =
    str(body?.bill_client_uuid) ?? currentBill ?? state.activeBillId ?? ACTIVE_KEY;
  const existing = currentBill ? trees[currentBill].find((el) => el.id === op.clientUuid) : undefined;
  const element: BoqElementData = existing ? { ...existing, title } : { id: op.clientUuid, title, items: [] };
  if (currentBill) {
    trees = mapTree(trees, currentBill, (tree) => tree.filter((el) => el.id !== op.clientUuid));
  }
  trees = mapTree(trees, targetBill, (tree) => insertAt(tree, element, sortOrder));
  return treesToPatch(state, trees);
};

const applyElementDelete = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  const trees = treesOf(state);
  const billId = findElementBill(trees, op.clientUuid);
  if (!billId) return null;
  return treesToPatch(state, mapTree(trees, billId, (tree) => tree.filter((el) => el.id !== op.clientUuid)));
};

const applyItemUpsert = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  const body = asRecord(op.body);
  if (!body) return null;
  const sortOrder = num(body.sort_order);
  let trees = treesOf(state);
  const current = findItemLocation(trees, op.clientUuid);
  const targetElementId = str(body.element_client_uuid) ?? current?.elementId;
  if (!targetElementId) return null;
  const targetBill = findElementBill(trees, targetElementId);
  if (!targetBill) return null; // element not known yet — its upsert is ahead of us
  const existing = current
    ? trees[current.billId].find((el) => el.id === current.elementId)?.items.find((it) => it.id === op.clientUuid)
    : undefined;
  const item: EstimationCardData = {
    id: op.clientUuid,
    unit: str(body.unit) ?? existing?.unit ?? 'm3',
    header: str(body.header) ?? existing?.header ?? '',
    description: str(body.description) ?? existing?.description ?? '',
    qty: str(body.qty) ?? existing?.qty ?? '0',
    rate: str(body.rate) ?? existing?.rate ?? '0',
    history: existing?.history ?? [],
  };
  if (current) {
    trees = mapTree(trees, current.billId, (tree) =>
      tree.map((el) =>
        el.id === current.elementId ? { ...el, items: el.items.filter((it) => it.id !== op.clientUuid) } : el
      )
    );
  }
  trees = mapTree(trees, targetBill, (tree) =>
    tree.map((el) => (el.id === targetElementId ? { ...el, items: insertAt(el.items, item, sortOrder) } : el))
  );
  return treesToPatch(state, trees);
};

const applyItemDelete = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  const trees = treesOf(state);
  const loc = findItemLocation(trees, op.clientUuid);
  if (!loc) return null;
  return treesToPatch(
    state,
    mapTree(trees, loc.billId, (tree) =>
      tree.map((el) =>
        el.id === loc.elementId ? { ...el, items: el.items.filter((it) => it.id !== op.clientUuid) } : el
      )
    )
  );
};

const applyHistoryUpsert = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  const body = asRecord(op.body);
  if (!body) return null;
  const value = str(body.value);
  if (value === undefined) return null;
  const sortOrder = num(body.sort_order);
  let trees = treesOf(state);
  const current = findHistoryLocation(trees, op.clientUuid);
  const targetItemId = str(body.item_client_uuid) ?? current?.itemId;
  if (!targetItemId) return null;
  const target = findItemLocation(trees, targetItemId);
  if (!target) return null; // item not known yet
  const existing = current
    ? trees[current.billId]
        .find((el) => el.id === current.elementId)
        ?.items.find((it) => it.id === current.itemId)
        ?.history.find((h) => h.id === op.clientUuid)
    : undefined;
  const source = str(body.source_measurement_client_uuid);
  const entry: HistoryItem = {
    id: op.clientUuid,
    value,
    ...(bool(body.is_deduct) ? { isDeduct: true } : {}),
    ...(source ? { sourceMeasurementId: source } : {}),
    // groupId has no API column — keep whatever this client already knew.
    ...(existing?.groupId ? { groupId: existing.groupId } : {}),
  };
  if (current) {
    trees = mapTree(trees, current.billId, (tree) =>
      tree.map((el) =>
        el.id === current.elementId
          ? {
              ...el,
              items: el.items.map((it) =>
                it.id === current.itemId ? { ...it, history: it.history.filter((h) => h.id !== op.clientUuid) } : it
              ),
            }
          : el
      )
    );
  }
  trees = mapTree(trees, target.billId, (tree) =>
    tree.map((el) =>
      el.id === target.elementId
        ? {
            ...el,
            items: el.items.map((it) =>
              it.id === targetItemId ? { ...it, history: insertAt(it.history, entry, sortOrder) } : it
            ),
          }
        : el
    )
  );
  return treesToPatch(state, trees);
};

const applyHistoryDelete = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  const trees = treesOf(state);
  const loc = findHistoryLocation(trees, op.clientUuid);
  if (!loc) return null;
  return treesToPatch(
    state,
    mapTree(trees, loc.billId, (tree) =>
      tree.map((el) =>
        el.id === loc.elementId
          ? {
              ...el,
              items: el.items.map((it) =>
                it.id === loc.itemId ? { ...it, history: it.history.filter((h) => h.id !== op.clientUuid) } : it
              ),
            }
          : el
      )
    )
  );
};

// ---------- dispatch ----------

/**
 * Fold one remote op into the takeoff slice. Returns the state patch to
 * apply, or null when the op is a no-op / unparseable. Comment ops are not
 * handled here (they live in useCommentsStore).
 */
export const reduceRemoteOp = (state: RemoteOpSlice, op: RemoteOp): Partial<RemoteOpSlice> | null => {
  switch (op.kind) {
    case 'measurement.create': {
      const takeoffItems = applyMeasurementCreate(state.takeoffItems, op);
      return takeoffItems ? { takeoffItems } : null;
    }
    case 'measurement.update': {
      const takeoffItems = applyMeasurementUpdate(state.takeoffItems, op);
      return takeoffItems ? { takeoffItems } : null;
    }
    case 'measurement.delete': {
      const takeoffItems = applyMeasurementDelete(state.takeoffItems, op);
      return takeoffItems ? { takeoffItems } : null;
    }
    case 'calibration.upsert':
      return applyCalibration(state, op, false);
    case 'calibration.delete':
      return applyCalibration(state, op, true);
    case 'boq.bill.upsert':
      return applyBillUpsert(state, op);
    case 'boq.bill.delete':
      return applyBillDelete(state, op);
    case 'boq.element.upsert':
      return applyElementUpsert(state, op);
    case 'boq.element.delete':
      return applyElementDelete(state, op);
    case 'boq.item.upsert':
      return applyItemUpsert(state, op);
    case 'boq.item.delete':
      return applyItemDelete(state, op);
    case 'boq.history.upsert':
      return applyHistoryUpsert(state, op);
    case 'boq.history.delete':
      return applyHistoryDelete(state, op);
    case 'comment.create':
    case 'comment.delete':
    case 'comment.thread.status':
      return null;
  }
};

/** Comment op payloads the comments store can apply without a refetch. */
export const parseCommentStatus = (op: RemoteOp): 'open' | 'resolved' | null => {
  const body = asRecord(op.body);
  const status = str(body?.status);
  return status === 'open' || status === 'resolved' ? status : null;
};
