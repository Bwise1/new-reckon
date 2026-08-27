import { create } from 'zustand';
import type {
  TakeoffItem,
  DrawTool,
  Measurement,
  CalibrationLine,
  EstimationCardData,
  BoqBillData,
  BoqElementData,
  BoqPricing,
  ProjectPlan,
  PlanDiscipline,
  Point,
} from '@/types/takeoff';
import { calculateAreaWithDeductions } from '@/utils/measurementUtils';
import {
  emptyPlanDocumentState,
  type PlanDocumentState,
  hydrateActivePlanView,
  resolvePlanBackgroundForCanvas,
} from '@/utils/planDocument';
import { inferPlanMediaKind } from '@/utils/planMediaLoader';
import { clearAllPlanPdfs, clearPlanPdf } from '@/utils/planPdfCache';
import { MARKUP_COLORS } from '@/constants/takeoffDesign';
import { createEmptyBoqElement, createEmptyBoqItem, renumberAutoElements } from '@/utils/boqCalculations';
import { loadProjectFromStorage, autoSaveProject } from '@/utils/persistence';
import { generateClientId } from '@/utils/id';
import { syncQueue } from '@/services/syncQueue';
import {
  boqTreeOpsDiff,
  calibrationUpsertBodyFromStore,
  measurementCreateBodyFromStore,
  measurementMetadataBody,
} from '@/utils/entitySyncMapper';
import {
  CANVAS_TAKEOFF_ITEM_ID,
  nextSeqForType,
  normalizeTakeoffItems,
  unitForTakeoffMode,
} from '@/utils/takeoffMeasurement';

// Command pattern for undo/redo
interface Command {
  execute: () => void;
  undo: () => void;
  description?: string;
}

interface TakeoffStore {
  // Project tracking
  currentProjectId: string | null;

  // Takeoff Items
  takeoffItems: TakeoffItem[];
  activeItemId: string | null;
  activeTool: DrawTool | null;
  /** Measuring-session id (tool pick-up → put-down). Shapes finished during
   *  the session share it as sectionGroupId → one panel pill. Not persisted. */
  measureSessionId: string | null;
  /** Right-click "New section": finished shapes join THIS group instead of
   *  the session's own id. Cleared on tool put-down. */
  pendingSectionGroup: string | null;
  activeColor: string;
  activeRealWidth: number;

  // Calibration
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  calibrationMode: boolean;

  // Canvas state (active plan view)
  currentPage: number;
  numPages: number;
  backgroundImage: string | null;
  /** Per-page rotation for the active plan (degrees: 0, 90, 180, 270). Swapped
   *  in/out per plan via planStates on selectPlan, keyed by page number. */
  rotations: Record<number, number>;
  plans: ProjectPlan[];
  activePlanId: string | null;
  planStates: Record<string, PlanDocumentState>;
  /** Client-side tombstones: ids of plans the user deleted. Suppressed
   * from every server merge path so the plan doesn't get resurrected
   * on the next pull if the server DELETE hasn't propagated yet. */
  deletedPlanIds: string[];

  boqElements: BoqElementData[];
  /** Bills (sheets). boqElements is always the ACTIVE bill's tree; inactive
   *  bills' trees are stashed in billElements (same pattern as planStates). */
  bills: BoqBillData[];
  activeBillId: string | null;
  billElements: Record<string, BoqElementData[]>;
  pricing: BoqPricing;

  /** The BOQ card that currently has focus in the sidebar. Used to auto-start
   * targeting when the user picks a tool without clicking the measure icon. */
  focusedBoqCard: { elementId: string; itemId: string; unit: string } | null;

  /** BOQ line the user is currently measuring for. When set, new
   * measurements stage their value in `pendingValue` so the user sees
   * it in the takeoff input and can Add/Deduct/edit before committing.
   * See docs/plan-measurement-to-boq-linking.md. */
  boqTargeting: {
    elementId: string;
    itemId: string;
    unit: string;
    mode: 'add' | 'deduct';
    /** Running sum of all measurements drawn in this session, as a
     * display string. Shown live in the takeoff input box. null when
     * nothing has been measured yet. */
    pendingValue: string | null;
    /** All measurement client uuids drawn in this session. All get bound
     * when the session is committed on Exit. */
    pendingMeasurementIds: string[];
    /** Running numeric total (raw) so we can add each new measurement. */
    pendingTotal: number;
    /** Minted fresh each time targeting starts. */
    sessionId: string;
  } | null;

  /** Snapshot of a just-ended measuring session, awaiting the user's
   * Add/Deduct commit. Survives Exit so the user can switch tools first
   * and commit later. Consumed (cleared) when EstimationCard commits, or
   * discarded when the user starts a new session on the same card. */
  pendingCommit: {
    elementId: string;
    itemId: string;
    value: string;
    total: number;
    measurementIds: string[];
    sessionId: string;
  } | null;

  /** Change just the add/deduct mode of the current targeting without
   * touching element/item/unit. Called when the user clicks Add or
   * Deduct in the toolbar while Measure is active. */
  setBoqTargetingMode: (mode: 'add' | 'deduct') => void;
  /** Populate the staging slot after a measurement commits. */
  setBoqTargetingPending: (value: string | null, measurementIds: string[]) => void;
  /** Keep measuring on the same card but under a NEW session id, so the next
   *  Add/Deduct commit becomes its own history chip rather than merging into
   *  the previous one (chips group by sessionId). */
  startNextBoqSession: () => void;
  /** Just write boqElementId/boqItemId onto a measurement and sync it.
   * Unlike bindMeasurementToItem, does NOT add a history entry — used
   * when the history entry was committed elsewhere (e.g. by the
   * EstimationCard commit path after the user clicked Add/Deduct on a
   * staged measured value). */
  setMeasurementBoqBinding: (
    measurementId: string,
    elementId: string | null,
    itemId: string | null
  ) => void;

  // Undo/Redo
  undoStack: Command[];
  redoStack: Command[];
  canUndo: boolean;
  canRedo: boolean;

  // Persistence
  loadProject: (projectId: string) => void;
  triggerAutoSave: () => void;
  addBill: (name?: string) => void;
  renameBill: (billId: string, name: string) => void;
  duplicateBill: (billId: string) => void;
  deleteBill: (billId: string) => void;
  switchBill: (billId: string) => void;
  /** All bills with their element trees (active bill from the working set). */
  collectBills: () => { id: string; name: string; elements: BoqElementData[] }[];
  /** Replace the whole bill structure (hydration). */
  setBillsState: (
    bills: BoqBillData[],
    activeBillId: string,
    billElements: Record<string, BoqElementData[]>,
    activeElements: BoqElementData[]
  ) => void;
  selectPlan: (planId: string) => void;
  addPlanFromUpload: (
    name: string,
    meta?: {
      url?: string;
      mimeType?: string;
      pageCount?: number;
      filename?: string;
      discipline?: PlanDiscipline;
    }
  ) => string;
  setPlanDiscipline: (planId: string, discipline: PlanDiscipline) => void;
  removePlan: (planId: string) => void;

  // Actions
  setTakeoffItems: (items: TakeoffItem[]) => void;
  addTakeoffItem: (item: TakeoffItem) => void;
  updateTakeoffItem: (id: string, updates: Partial<TakeoffItem>) => void;
  deleteTakeoffItem: (id: string) => void;
  duplicateTakeoffItem: (id: string) => void;
  moveTakeoffItemUp: (id: string) => void;
  moveTakeoffItemDown: (id: string) => void;
  setActiveItemId: (id: string | null) => void;
  setActiveTool: (tool: DrawTool | null) => void;
  setPendingSectionGroup: (groupId: string | null) => void;
  /** Retro-tag an existing measurement with a section group (used when
   *  "New section" targets a measurement that predates grouping). */
  setMeasurementSectionGroup: (
    itemId: string,
    measurementId: string,
    groupId: string
  ) => void;
  setActiveColor: (color: string) => void;
  setActiveRealWidth: (width: number) => void;
  setFocusedBoqCard: (card: { elementId: string; itemId: string; unit: string } | null) => void;
  ensureCanvasItemId: () => string;

  addMeasurement: (itemId: string, measurement: Measurement) => void;
  removeMeasurement: (itemId: string, measurementId: string) => void;
  toggleMeasurementHidden: (itemId: string, measurementId: string) => void;
  /** Rename a measurement (empty string clears back to the auto label). */
  renameMeasurement: (itemId: string, measurementId: string, name: string) => void;
  /** Append a deduction (inner polygon) to an area measurement. Recomputes
   * quantity as outer − Σdeductions. Undoable. */
  addDeductionToMeasurement: (
    itemId: string,
    measurementId: string,
    deduction: Point[]
  ) => void;
  /** Remove the deduction at deductionIndex. Recomputes quantity. Undoable. */
  removeDeductionFromMeasurement: (
    itemId: string,
    measurementId: string,
    deductionIndex: number
  ) => void;

  /** Enter measuring-for-a-BOQ-line mode. Auto-switches the drawing tool
   * to match the target's unit (m→linear, m²→area, nrs→count). New
   * measurements auto-bind. `mode` defaults to 'add'. */
  startBoqTargeting: (
    elementId: string,
    itemId: string,
    unit: string,
    mode?: 'add' | 'deduct'
  ) => void;
  exitBoqTargeting: () => void;
  /** End the session without committing. Escape/discard flow. */
  cancelBoqTargeting: () => void;
  /** Clear the pending-commit slot after EstimationCard commits it. */
  clearPendingCommit: () => void;
  /** Bind an existing measurement to a BOQ item. Adds a corresponding
   * history entry on the target item with sourceMeasurementId set.
   * `mode` defaults to 'add'; passing 'deduct' commits the entry as
   * isDeduct: true. Pass an array of ids to commit a whole session as
   * one chip; optionally pass a pre-computed `value` string and `sessionId`. */
  bindMeasurementToItem: (
    measurementId: string | string[],
    elementId: string,
    itemId: string,
    mode?: 'add' | 'deduct',
    value?: string,
    sessionId?: string,
  ) => void;
  /** Remove the binding on a measurement AND drop the corresponding
   * history entry from whatever item it was on. */
  unbindMeasurement: (measurementId: string) => void;

  setScale: (page: number, scale: number) => void;
  clearScale: (page: number) => void;
  setCalibrationLine: (page: number, line: CalibrationLine) => void;
  setCalibrationMode: (mode: boolean) => void;
  /** Rotate a page by delta degrees (90 or -90).
   *  transformPoints: optional fn to remap existing measurement points to the new orientation. */
  rotatePage: (
    page: number,
    delta: number,
    transformPoints?: (p: { x: number; y: number }) => { x: number; y: number }
  ) => void;
  /** Apply the same rotation delta to all pages in the active plan.
   *  transformPoints: optional fn keyed by page number. */
  rotateAllPages: (
    delta: number,
    transformPointsByPage?: Record<number, (p: { x: number; y: number }) => { x: number; y: number }>
  ) => void;

  setCurrentPage: (page: number) => void;
  setNumPages: (pages: number) => void;
  setBackgroundImage: (image: string | null) => void;
  setPricing: (pricing: Partial<BoqPricing>) => void;

  addBoqElement: () => void;
  updateBoqElement: (elementId: string, updates: Partial<BoqElementData>) => void;
  addElementItem: (elementId: string) => void;
  updateElementItem: (
    elementId: string,
    itemId: string,
    updates: Partial<EstimationCardData>
  ) => void;
  deleteElementItem: (elementId: string, itemId: string) => void;
  duplicateElementItem: (elementId: string, itemId: string) => void;

  // Undo/Redo actions
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Reset
  reset: () => void;
}

const MAX_HISTORY_SIZE = 50;

const snapshotActivePlanState = (state: {
  activePlanId: string | null;
  plans: ProjectPlan[];
  planStates: Record<string, PlanDocumentState>;
  backgroundImage: string | null;
  numPages: number;
  currentPage: number;
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  rotations: Record<number, number>;
}): Record<string, PlanDocumentState> => {
  if (!state.activePlanId) return state.planStates;
  const plan = state.plans.find((p) => p.id === state.activePlanId);
  const backgroundImage =
    plan && inferPlanMediaKind(plan) === 'pdf' ? null : state.backgroundImage;
  return {
    ...state.planStates,
    [state.activePlanId]: {
      backgroundImage,
      numPages: state.numPages,
      currentPage: state.currentPage,
      scales: state.scales,
      calibrationLines: state.calibrationLines,
      rotations: state.rotations,
    },
  };
};

const initialState = {
  currentProjectId: null,
  takeoffItems: [],
  activeItemId: null,
  activeTool: null,
  measureSessionId: null,
  pendingSectionGroup: null,
  activeColor: MARKUP_COLORS[0],
  // 0 = hairline (no real-width band). Width is opt-in for walls etc.
  activeRealWidth: 0,
  scales: {},
  calibrationLines: {},
  calibrationMode: false,
  currentPage: 1,
  numPages: 0,
  backgroundImage: null,
  rotations: {},
  plans: [],
  activePlanId: null,
  planStates: {},
  deletedPlanIds: [],
  boqElements: [createEmptyBoqElement(0)],
  bills: [],
  activeBillId: null,
  billElements: {},
  focusedBoqCard: null,
  boqTargeting: null,
  pendingCommit: null,
  pricing: {
    vatRate: 0,
    contingency: 0,
  },
  undoStack: [] as Command[],
  redoStack: [] as Command[],
  canUndo: false,
  canRedo: false,
};

export const useTakeoffStore = create<TakeoffStore>((set, get) => {
  // Helper to execute a command and add to undo stack
  const executeCommand = (command: Command, skipHistory: boolean = false) => {
    command.execute();

    if (!skipHistory) {
      set((state) => {
        const newUndoStack = [...state.undoStack, command];
        // Limit history size
        const trimmedStack = newUndoStack.slice(-MAX_HISTORY_SIZE);
        return {
          undoStack: trimmedStack,
          redoStack: [], // Clear redo stack when new action is performed
          canUndo: trimmedStack.length > 0,
          canRedo: false,
        };
      });
      get().triggerAutoSave();
    }
  };

  /**
   * Compute the ops needed to bring the server BOQ in sync with the current
   * store BOQ (relative to `before`), and enqueue them. Called at the end of
   * every BOQ mutation. See docs/sync-rebuild.md and entitySyncMapper.
   */
  /**
   * Refresh the live takeoff input after a session measurement's quantity
   * changes outside addMeasurement (deduction added/removed, count updated).
   * pendingValue is a snapshot taken when the measurement was drawn, so
   * without this the input keeps showing the stale figure. Recomputes the
   * session total from current quantities — which also makes undo
   * self-correcting: rerun after restore and it lands on the old total.
   */
  const refreshPendingSessionTotal = (measurementId: string) => {
    const sumFor = (ids: string[]) => {
      let total = 0;
      const allItems = get().takeoffItems;
      for (const mid of ids) {
        for (const ti of allItems) {
          const m = ti.measurements.find((mm) => mm.id === mid);
          if (m) {
            total += Math.abs(m.quantity);
            break;
          }
        }
      }
      return total;
    };

    // Live session: the input shows boqTargeting.pendingValue.
    const target = get().boqTargeting;
    if (target && target.pendingMeasurementIds.includes(measurementId)) {
      const newTotal = sumFor(target.pendingMeasurementIds);
      if (newTotal !== target.pendingTotal) {
        set((state) =>
          state.boqTargeting
            ? {
                boqTargeting: {
                  ...state.boqTargeting,
                  pendingTotal: newTotal,
                  pendingValue: newTotal.toFixed(2),
                },
              }
            : state
        );
      }
    }

    // Stashed session: after Exit/Escape the staged value lives in
    // pendingCommit.value and the input shows THAT (see EstimationCard's
    // pendingMeasuredValue). Deducting from an area in this state is common —
    // finish measuring, then punch holes — so refresh it too, or the input
    // keeps the pre-deduction figure even though the measurement changed.
    const stashed = get().pendingCommit;
    if (stashed && stashed.measurementIds.includes(measurementId)) {
      const newTotal = sumFor(stashed.measurementIds);
      if (newTotal !== stashed.total) {
        set((state) =>
          state.pendingCommit
            ? {
                pendingCommit: {
                  ...state.pendingCommit,
                  total: newTotal,
                  value: newTotal.toFixed(2),
                },
              }
            : state
        );
      }
    }
  };

  const enqueueBoqOpsFromDiff = (before: BoqElementData[]) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const after = get().boqElements;
    const billId = get().activeBillId ?? undefined;
    for (const op of boqTreeOpsDiff(projectId, before, after, billId)) {
      syncQueue.enqueue(op);
    }
  };

  return {
    ...initialState,

    // Persistence methods
    loadProject: (projectId: string) => {
      const savedData = loadProjectFromStorage(projectId);
      if (savedData) {
        const base = {
          currentProjectId: projectId,
          takeoffItems: normalizeTakeoffItems(savedData.takeoffItems),
          activeTool: null,
          activeColor: MARKUP_COLORS[0],
          plans: savedData.plans ?? [],
          activePlanId: savedData.activePlanId ?? null,
          planStates: savedData.planStates ?? {},
          deletedPlanIds: savedData.deletedPlanIds ?? [],
          boqElements:
            savedData.boqElements?.length > 0
              ? savedData.boqElements
              : [createEmptyBoqElement(0)],
          // Legacy saves have no bills — wrap the tree in a default bill.
          ...(savedData.bills && savedData.bills.length > 0
            ? {
                bills: savedData.bills,
                activeBillId:
                  savedData.activeBillId &&
                  savedData.bills.some((b) => b.id === savedData.activeBillId)
                    ? savedData.activeBillId
                    : savedData.bills[0].id,
                billElements: savedData.billElements ?? {},
              }
            : (() => {
                const defaultBill = { id: generateClientId(), name: 'Bill No. 1' };
                return {
                  bills: [defaultBill],
                  activeBillId: defaultBill.id,
                  billElements: {},
                };
              })()),
          pricing: savedData.pricing || { vatRate: 0, contingency: 0 },
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
        };
        const view = hydrateActivePlanView({
          plans: base.plans,
          activePlanId: base.activePlanId,
          planStates: base.planStates,
          numPages: savedData.numPages,
          currentPage: savedData.currentPage,
          scales: savedData.scales,
          calibrationLines: savedData.calibrationLines,
          backgroundImage: savedData.backgroundImage,
        });
        set({ ...base, ...view });
        console.log('Loaded project from storage:', projectId);
      } else {
        // New project, reset to initial state but keep the projectId
        set({
          ...initialState,
          currentProjectId: projectId
        });
        console.log('Starting new project:', projectId);
      }
    },

  addBill: (name) => {
    const state = get();
    const projectId = state.currentProjectId;
    // A project that predates bills has an unowned working set: adopt it as
    // the first bill before adding, or the current elements would be orphaned.
    let bills = state.bills;
    let stashed = state.billElements;
    if (!state.activeBillId || bills.length === 0) {
      const firstId = generateClientId();
      bills = [{ id: firstId, name: 'Bill No. 1' }];
      stashed = { [firstId]: state.boqElements };
      if (projectId) {
        syncQueue.enqueue({
          kind: 'boq.bill.upsert',
          projectId,
          clientUuid: firstId,
          body: { name: 'Bill No. 1', sort_order: 0 },
        });
      }
    } else {
      stashed = { ...stashed, [state.activeBillId]: state.boqElements };
    }
    const id = generateClientId();
    const billName = name ?? `Bill No. ${bills.length + 1}`;
    set({
      bills: [...bills, { id, name: billName }],
      billElements: stashed,
      activeBillId: id,
      boqElements: [createEmptyBoqElement(0)],
      focusedBoqCard: null,
    });
    if (projectId) {
      syncQueue.enqueue({
        kind: 'boq.bill.upsert',
        projectId,
        clientUuid: id,
        body: { name: billName, sort_order: bills.length },
      });
    }
    get().triggerAutoSave();
  },

  renameBill: (billId, name) => {
    const state = get();
    const bill = state.bills.find((b) => b.id === billId);
    if (!bill || bill.name === name) return;
    set({
      bills: state.bills.map((b) => (b.id === billId ? { ...b, name } : b)),
    });
    const projectId = state.currentProjectId;
    if (projectId) {
      syncQueue.enqueue({
        kind: 'boq.bill.upsert',
        projectId,
        clientUuid: billId,
        body: { name, sort_order: state.bills.findIndex((b) => b.id === billId) },
      });
    }
    get().triggerAutoSave();
  },

  duplicateBill: (billId) => {
    const state = get();
    const source = state.bills.find((b) => b.id === billId);
    if (!source) return;
    const sourceElements =
      billId === state.activeBillId
        ? state.boqElements
        : state.billElements[billId] ?? [];
    // Fresh ids at every level, mirroring the prototype's cloneBillWithFreshIds.
    const cloned = sourceElements.map((el) => ({
      ...el,
      id: generateClientId(),
      items: el.items.map((item) => ({
        ...item,
        id: generateClientId(),
        history: item.history.map((h) => ({
          ...h,
          id: generateClientId(),
          // Measurement links must not duplicate — the measurement belongs
          // to the original item only.
          sourceMeasurementId: undefined,
          groupId: undefined,
        })),
      })),
    }));
    const id = generateClientId();
    const name = `${source.name} (Copy)`;
    const stashed = state.activeBillId
      ? { ...state.billElements, [state.activeBillId]: state.boqElements }
      : state.billElements;
    set({
      bills: [...state.bills, { id, name }],
      billElements: stashed,
      activeBillId: id,
      boqElements: cloned.length > 0 ? cloned : [createEmptyBoqElement(0)],
      focusedBoqCard: null,
    });
    const projectId = state.currentProjectId;
    if (projectId) {
      syncQueue.enqueue({
        kind: 'boq.bill.upsert',
        projectId,
        clientUuid: id,
        body: { name, sort_order: state.bills.length },
      });
      for (const op of boqTreeOpsDiff(projectId, [], get().boqElements, id)) {
        syncQueue.enqueue(op);
      }
    }
    get().triggerAutoSave();
  },

  deleteBill: (billId) => {
    const state = get();
    if (state.bills.length <= 1) return;
    const idx = state.bills.findIndex((b) => b.id === billId);
    if (idx === -1) return;
    const deletedElements =
      billId === state.activeBillId
        ? state.boqElements
        : state.billElements[billId] ?? [];
    const nextBills = state.bills.filter((b) => b.id !== billId);
    const nextStash = { ...state.billElements };
    delete nextStash[billId];

    let nextActive = state.activeBillId;
    let nextElements = state.boqElements;
    if (billId === state.activeBillId) {
      const fallback = nextBills[Math.max(0, idx - 1)];
      nextActive = fallback.id;
      nextElements = nextStash[fallback.id] ?? [createEmptyBoqElement(0)];
      delete nextStash[fallback.id];
    }
    set({
      bills: nextBills,
      billElements: nextStash,
      activeBillId: nextActive,
      boqElements: nextElements,
      focusedBoqCard: null,
    });
    const projectId = state.currentProjectId;
    if (projectId) {
      // Explicit element deletes first (also covered server-side by cascade).
      for (const el of deletedElements) {
        syncQueue.enqueue({ kind: 'boq.element.delete', projectId, clientUuid: el.id });
      }
      syncQueue.enqueue({ kind: 'boq.bill.delete', projectId, clientUuid: billId });
    }
    get().triggerAutoSave();
  },

  switchBill: (billId) => {
    const state = get();
    if (billId === state.activeBillId) return;
    if (!state.bills.some((b) => b.id === billId)) return;
    // Commit any open measuring session before switching, same as plan switch.
    if (state.boqTargeting) get().exitBoqTargeting();
    const current = get();
    const stashed = current.activeBillId
      ? { ...current.billElements, [current.activeBillId]: current.boqElements }
      : current.billElements;
    const nextElements = stashed[billId] ?? [createEmptyBoqElement(0)];
    const nextStash = { ...stashed };
    delete nextStash[billId];
    set({
      billElements: nextStash,
      activeBillId: billId,
      boqElements: nextElements,
      focusedBoqCard: null,
    });
    get().triggerAutoSave();
  },

  collectBills: () => {
    const state = get();
    return state.bills.map((bill) => ({
      id: bill.id,
      name: bill.name,
      elements:
        bill.id === state.activeBillId
          ? state.boqElements
          : state.billElements[bill.id] ?? [],
    }));
  },

  setBillsState: (bills, activeBillId, billElements, activeElements) => {
    const stash = { ...billElements };
    delete stash[activeBillId];
    set({
      bills,
      activeBillId,
      billElements: stash,
      boqElements: activeElements.length > 0 ? activeElements : [createEmptyBoqElement(0)],
      focusedBoqCard: null,
    });
  },

  triggerAutoSave: () => {
    const state = get();
    if (state.currentProjectId) {
      const planStates = snapshotActivePlanState(state);
      if (planStates !== state.planStates) {
        set({ planStates });
      }

      autoSaveProject(state.currentProjectId, {
        takeoffItems: state.takeoffItems,
        scales: state.scales,
        calibrationLines: state.calibrationLines,
        currentPage: state.currentPage,
        numPages: state.numPages,
        backgroundImage: state.backgroundImage,
        plans: state.plans,
        activePlanId: state.activePlanId,
        planStates,
        deletedPlanIds: state.deletedPlanIds,
        boqElements: state.boqElements,
        bills: state.bills,
        activeBillId: state.activeBillId,
        billElements: state.billElements,
        pricing: state.pricing,
        rotations: state.rotations,
      });
      // Note: server sync no longer happens through the wholesale
      // scheduleProjectSyncPush path. Each mutation enqueues per-entity ops
      // via syncQueue. See docs/sync-rebuild.md.
    }
  },

  selectPlan: (planId) => {
    const state = get();
    if (state.activePlanId === planId) return;

    // Commit any open measuring session before switching plans so the
    // running total isn't silently discarded.
    if (state.boqTargeting) get().exitBoqTargeting();

    const planStates = snapshotActivePlanState(state);
    const next = planStates[planId] ?? emptyPlanDocumentState();
    const planMeta = state.plans.find((plan) => plan.id === planId);
    const backgroundImage = resolvePlanBackgroundForCanvas(planMeta, next.backgroundImage);
    const numPages = next.numPages || planMeta?.pageCount || 0;

    set({
      planStates,
      activePlanId: planId,
      backgroundImage,
      numPages,
      currentPage: next.currentPage || 1,
      scales: next.scales,
      calibrationLines: next.calibrationLines,
      rotations: next.rotations ?? {},
    });
    get().triggerAutoSave();
  },

  addPlanFromUpload: (name, meta) => {
    const state = get();
    const planStates = snapshotActivePlanState(state);
    const id = generateClientId();
    const plan: ProjectPlan = {
      id,
      name,
      filename: meta?.filename,
      url: meta?.url,
      mimeType: meta?.mimeType,
      pageCount: meta?.pageCount ?? 1,
      sortOrder: state.plans.length,
      discipline: meta?.discipline,
    };
    const fresh = emptyPlanDocumentState();

    set({
      plans: [...state.plans, plan],
      planStates: { ...planStates, [id]: fresh },
      activePlanId: id,
      backgroundImage: null,
      numPages: meta?.pageCount ?? 0,
      currentPage: 1,
      scales: {},
      calibrationLines: {},
      rotations: {},
    });
    get().triggerAutoSave();
    return id;
  },

  setPlanDiscipline: (planId, discipline) => {
    set((state) => ({
      plans: state.plans.map((plan) =>
        plan.id === planId ? { ...plan, discipline } : plan
      ),
    }));
    get().triggerAutoSave();
  },

  removePlan: (planId) => {
    const state = get();
    const remaining = state.plans.filter((p) => p.id !== planId);
    const newActivePlanId =
      state.activePlanId === planId
        ? (remaining[remaining.length - 1]?.id ?? null)
        : state.activePlanId;

    const planStates = { ...state.planStates };
    delete planStates[planId];

    // Drop every measurement bound to the deleted plan and recompute item totals.
    const removedMeasurementIds: string[] = [];
    const takeoffItems = state.takeoffItems.map((item) => {
      const kept = item.measurements.filter((m) => m.planId !== planId);
      if (kept.length === item.measurements.length) return item;
      for (const m of item.measurements) {
        if (m.planId === planId) removedMeasurementIds.push(m.id);
      }
      const totalQuantity = kept.reduce((sum, m) => sum + m.quantity, 0);
      return { ...item, measurements: kept, totalQuantity };
    });

    // There is no DB cascade from plans to measurements/calibrations (the FK is
    // app-enforced), so without these the rows survive server-side and come
    // back on the next hydration pointing at a plan that no longer exists.
    if (state.currentProjectId) {
      const projectId = state.currentProjectId;
      for (const measurementId of removedMeasurementIds) {
        syncQueue.enqueue({
          kind: 'measurement.delete',
          projectId,
          clientUuid: measurementId,
        });
      }
      for (const page of Object.keys(state.planStates[planId]?.scales ?? {})) {
        syncQueue.enqueue({
          kind: 'calibration.delete',
          projectId,
          planUuid: planId,
          page: Number(page),
        });
      }
    }

    // Cached PDF for this plan is useless now.
    clearPlanPdf(planId);

    const view = hydrateActivePlanView({
      plans: remaining,
      activePlanId: newActivePlanId,
      planStates,
      numPages: state.numPages,
      currentPage: state.currentPage,
      scales: state.scales,
      calibrationLines: state.calibrationLines,
      backgroundImage: state.backgroundImage,
    });

    const deletedPlanIds = state.deletedPlanIds.includes(planId)
      ? state.deletedPlanIds
      : [...state.deletedPlanIds, planId];

    set({
      plans: remaining,
      activePlanId: newActivePlanId,
      planStates,
      takeoffItems,
      deletedPlanIds,
      ...view,
    });
    get().triggerAutoSave();
  },

  setTakeoffItems: (items) => {
    const previousItems = get().takeoffItems;
    // Normalize so legacy/server measurements get type/color/seq backfilled
    // (seq drives the stable "Area 1" auto label).
    const normalized = normalizeTakeoffItems(items);
    executeCommand({
      execute: () => set({ takeoffItems: normalized }),
      undo: () => set({ takeoffItems: previousItems }),
      description: 'Set takeoff items',
    });
  },

  addTakeoffItem: (item) => {
    executeCommand({
      execute: () => {
        set((state) => ({
          takeoffItems: [...state.takeoffItems, item],
          activeItemId: item.id,
        }));
      },
      undo: () => {
        set((state) => ({
          takeoffItems: state.takeoffItems.filter((i) => i.id !== item.id),
          activeItemId: state.activeItemId === item.id ? null : state.activeItemId,
        }));
      },
      description: `Add ${item.type} item: ${item.name}`,
    });
  },

  updateTakeoffItem: (id, updates) => {
    const state = get();
    const item = state.takeoffItems.find((i) => i.id === id);
    if (!item) return;

    const previousItem = { ...item };
    executeCommand({
      execute: () => {
        set((state) => ({
          takeoffItems: state.takeoffItems.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
        // If measurements changed, emit per-measurement update ops for anything
        // whose points/quantity/color/hidden differs from before.
        const projectId = get().currentProjectId;
        if (projectId && updates.measurements) {
          const beforeById = new Map(previousItem.measurements.map((m) => [m.id, m]));
          const quantityChanges: Array<{ measurementId: string; quantity: number }> = [];
          for (const next of updates.measurements) {
            const prev = beforeById.get(next.id);
            if (!prev) continue; // new measurements ride addMeasurement's path.
            if (
              prev.points === next.points &&
              prev.quantity === next.quantity &&
              prev.color === next.color &&
              prev.hidden === next.hidden &&
              prev.strokeWidth === next.strokeWidth &&
              prev.name === next.name
            ) {
              continue;
            }
            syncQueue.enqueue({
              kind: 'measurement.update',
              projectId,
              clientUuid: next.id,
              patch: {
                points: next.points,
                deductions:
                  next.deductions && next.deductions.length > 0
                    ? next.deductions
                    : null,
                quantity: next.quantity,
                color: next.color,
                hidden: Boolean(next.hidden),
                // strokeWidth/name live in the metadata blob — include them so a
                // line-width (or rename) edit actually persists to the server.
                metadata: {
                  createdAt: next.metadata?.createdAt,
                  lastModified: next.metadata?.lastModified,
                  confidence: next.metadata?.confidence,
                  strokeWidth: next.strokeWidth,
                  name: next.name,
                  seq: next.seq,
                },
              },
            });
            if (prev.quantity !== next.quantity) {
              quantityChanges.push({
                measurementId: next.id,
                quantity: next.quantity,
              });
            }
          }
          // Count tool: subsequent clicks extend an existing measurement
          // rather than creating a new one, so addMeasurement's targeting
          // path never fires. Update the running session total here when
          // one of the session's measurements changes quantity.
          const target = get().boqTargeting;
          if (target && target.pendingMeasurementIds.length > 0) {
            let newTotal = target.pendingTotal;
            for (const change of quantityChanges) {
              if (target.pendingMeasurementIds.includes(change.measurementId)) {
                // Replace the old contribution of that measurement with the new one.
                // We don't know the old per-measurement value, so recompute from scratch.
                newTotal = 0;
                const allItems = get().takeoffItems;
                for (const mid of target.pendingMeasurementIds) {
                  for (const ti of allItems) {
                    const m = ti.measurements.find((m) => m.id === mid);
                    if (m) { newTotal += Math.abs(m.quantity); break; }
                  }
                }
                break;
              }
            }
            if (newTotal !== target.pendingTotal) {
              set((state) =>
                state.boqTargeting
                  ? {
                      boqTargeting: {
                        ...state.boqTargeting,
                        pendingTotal: newTotal,
                        pendingValue: newTotal.toFixed(2),
                      },
                    }
                  : state
              );
            }
          }
          // If any bound measurement's quantity changed, reflect it in the
          // linked BOQ history entry so mobile (which can't see the plan)
          // sees an accurate number.
          if (quantityChanges.length > 0) {
            const boqBefore = get().boqElements;
            set((state) => ({
              boqElements: state.boqElements.map((element) => ({
                ...element,
                items: element.items.map((boqItem) => ({
                  ...boqItem,
                  history: boqItem.history.map((entry) => {
                    if (!entry.sourceMeasurementId) return entry;
                    const change = quantityChanges.find(
                      (c) => c.measurementId === entry.sourceMeasurementId
                    );
                    if (!change) return entry;
                    return {
                      ...entry,
                      // Preserve the user's Add/Deduct choice; only the
                      // numeric value changes.
                      value: Math.abs(change.quantity).toFixed(2),
                    };
                  }),
                })),
              })),
            }));
            enqueueBoqOpsFromDiff(boqBefore);
          }
        }
      },
      undo: () => {
        set((state) => ({
          takeoffItems: state.takeoffItems.map((item) =>
            item.id === id ? previousItem : item
          ),
        }));
      },
      description: `Update item: ${item.name}`,
    });
  },

  deleteTakeoffItem: (id) => {
    const state = get();
    const item = state.takeoffItems.find((i) => i.id === id);
    if (!item) return;

    const previousItems = [...state.takeoffItems];
    const previousActiveId = state.activeItemId;
    
    executeCommand({
      execute: () => {
        set((state) => ({
          takeoffItems: state.takeoffItems.filter((item) => item.id !== id),
          activeItemId: state.activeItemId === id ? null : state.activeItemId,
        }));
      },
      undo: () => {
        set({
          takeoffItems: previousItems,
          activeItemId: previousActiveId,
        });
      },
      description: `Delete item: ${item.name}`,
    });
  },

  duplicateTakeoffItem: (id) => {
    const state = get();
    const source = state.takeoffItems.find((i) => i.id === id);
    if (!source) return;

    const copy: TakeoffItem = {
      ...source,
      id: generateClientId(),
      name: `${source.name} (Copy)`,
      measurements: source.measurements.map((m) => ({
        ...m,
        id: generateClientId(),
      })),
    };

    const sourceIndex = state.takeoffItems.findIndex((i) => i.id === id);

    executeCommand({
      execute: () => {
        set((current) => {
          const items = [...current.takeoffItems];
          items.splice(sourceIndex + 1, 0, copy);
          return {
            takeoffItems: items,
            activeItemId: copy.id,
          };
        });
      },
      undo: () => {
        set((current) => ({
          takeoffItems: current.takeoffItems.filter((i) => i.id !== copy.id),
          activeItemId: current.activeItemId === copy.id ? id : current.activeItemId,
        }));
      },
      description: `Duplicate item: ${source.name}`,
    });
  },

  moveTakeoffItemUp: (id) => {
    const state = get();
    const index = state.takeoffItems.findIndex((i) => i.id === id);
    if (index <= 0) return;
    const previousItems = [...state.takeoffItems];

    executeCommand({
      execute: () => {
        set((current) => {
          const items = [...current.takeoffItems];
          [items[index - 1], items[index]] = [items[index], items[index - 1]];
          return { takeoffItems: items };
        });
      },
      undo: () => set({ takeoffItems: previousItems }),
      description: 'Move item up',
    });
  },

  moveTakeoffItemDown: (id) => {
    const state = get();
    const index = state.takeoffItems.findIndex((i) => i.id === id);
    if (index === -1 || index >= state.takeoffItems.length - 1) return;
    const previousItems = [...state.takeoffItems];

    executeCommand({
      execute: () => {
        set((current) => {
          const items = [...current.takeoffItems];
          [items[index], items[index + 1]] = [items[index + 1], items[index]];
          return { takeoffItems: items };
        });
      },
      undo: () => set({ takeoffItems: previousItems }),
      description: 'Move item down',
    });
  },

  setActiveItemId: (id) => set({ activeItemId: id }),

  setActiveTool: (tool) => {
    // If a measuring session is active and the user picks a tool whose
    // unit no longer matches the target, close the session first so the
    // running total is committed as one chip before switching.
    const target = get().boqTargeting;
    if (target && tool !== null) {
      const toolUnit = unitForTakeoffMode(tool === 'arc' ? 'polyline' : tool);
      if (toolUnit !== target.unit) {
        get().exitBoqTargeting();
      }
    }
    // Sections: each draw-tool pick-up starts a fresh measuring session;
    // put-down (or switching tools) ends it. Count self-accumulates into one
    // measurement already, so it carries no session. pendingSectionGroup is
    // always cleared — "New section" sets it AFTER this call.
    set({
      activeTool: tool,
      measureSessionId: tool && tool !== 'count' ? generateClientId() : null,
      pendingSectionGroup: null,
    });
  },

  setPendingSectionGroup: (groupId) => set({ pendingSectionGroup: groupId }),

  setMeasurementSectionGroup: (itemId, measurementId, groupId) => {
    let updated: Measurement | null = null;
    set((state) => ({
      takeoffItems: state.takeoffItems.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          measurements: item.measurements.map((m) => {
            if (m.id !== measurementId) return m;
            updated = { ...m, sectionGroupId: groupId };
            return updated;
          }),
        };
      }),
    }));
    if (!updated) return;
    get().triggerAutoSave();
    const projectId = get().currentProjectId;
    if (projectId) {
      syncQueue.enqueue({
        kind: 'measurement.update',
        projectId,
        clientUuid: measurementId,
        patch: { metadata: measurementMetadataBody(updated) },
      });
    }
  },

  setActiveColor: (color) => set({ activeColor: color }),

  setActiveRealWidth: (width) => set({ activeRealWidth: width }),

  setFocusedBoqCard: (card) => set({ focusedBoqCard: card }),

  startBoqTargeting: (elementId, itemId, unit, mode = 'add') => {
    const current = get().boqTargeting;
    const pending = get().pendingCommit;
    // If a session was active on a different card, stash its state into
    // pendingCommit for later, then start fresh.
    if (current && (current.elementId !== elementId || current.itemId !== itemId)) {
      get().exitBoqTargeting();
    }
    // If the user re-enters measuring on the SAME card that has an
    // un-committed pendingCommit, resume that session so more draws add
    // to the same running total. But first drop any orphaned measurement
    // ids (deleted since the session was stashed) and recompute the total
    // from live measurements only — otherwise stale contributions from
    // vanished measurements would leak back into pendingTotal.
    if (pending && pending.elementId === elementId && pending.itemId === itemId) {
      const allItems = get().takeoffItems;
      const liveIds: string[] = [];
      let liveTotal = 0;
      for (const mid of pending.measurementIds) {
        for (const ti of allItems) {
          const m = ti.measurements.find((mm) => mm.id === mid);
          if (m) {
            liveIds.push(mid);
            liveTotal += Math.abs(m.quantity);
            break;
          }
        }
      }
      if (liveIds.length === 0) {
        // Nothing left to resume — start fresh.
        set({
          boqTargeting: {
            elementId,
            itemId,
            unit,
            mode,
            pendingValue: null,
            pendingMeasurementIds: [],
            pendingTotal: 0,
            sessionId: generateClientId(),
          },
          pendingCommit: null,
        });
        return;
      }
      set({
        boqTargeting: {
          elementId,
          itemId,
          unit,
          mode,
          pendingValue: liveTotal.toFixed(2),
          pendingMeasurementIds: liveIds,
          pendingTotal: liveTotal,
          sessionId: pending.sessionId,
        },
        pendingCommit: null,
      });
      return;
    }
    set({
      boqTargeting: {
        elementId,
        itemId,
        unit,
        mode,
        pendingValue: null,
        pendingMeasurementIds: [],
        pendingTotal: 0,
        sessionId: generateClientId(),
      },
    });
  },

  exitBoqTargeting: () => {
    // Commit-on-demand: drawn measurements are STAGED in boqTargeting (no chip
    // yet), so ending the session must stash them into pendingCommit — the
    // takeoff input keeps showing the value and Add/Deduct can commit it
    // later. Discarding here (the old auto-commit-era behavior) silently lost
    // the staged expression on click-away.
    set((state) => {
      const t = state.boqTargeting;
      if (t && t.pendingMeasurementIds.length > 0 && t.pendingValue) {
        return {
          boqTargeting: null,
          pendingCommit: {
            elementId: t.elementId,
            itemId: t.itemId,
            value: t.pendingValue,
            total: t.pendingTotal,
            measurementIds: t.pendingMeasurementIds,
            sessionId: t.sessionId,
          },
        };
      }
      // No staged session content — end targeting but LEAVE any existing
      // pendingCommit stash alone. Nulling it here wiped the takeoff box when
      // Escape (or putting the tool down) fired after a session had already
      // ended. The stash is cleared only by commit or an explicit discard.
      return { boqTargeting: null };
    });
  },

  cancelBoqTargeting: () => {
    // Discard the session entirely (Escape). Measurements drawn during the
    // session stay on the plan but remain unbound. Also clears any prior
    // uncommitted pendingCommit — a full discard.
    set({ boqTargeting: null, pendingCommit: null });
  },

  clearPendingCommit: () => set({ pendingCommit: null }),

  setBoqTargetingMode: (mode) => {
    set((state) =>
      state.boqTargeting
        ? { boqTargeting: { ...state.boqTargeting, mode } }
        : state
    );
  },

  setBoqTargetingPending: (value, measurementIds) => {
    set((state) =>
      state.boqTargeting
        ? {
            boqTargeting: {
              ...state.boqTargeting,
              pendingValue: value,
              pendingMeasurementIds: measurementIds,
            },
          }
        : state
    );
  },

  startNextBoqSession: () => {
    // After an Add/Deduct commit the session stays open so the user can keep
    // measuring on the same card — but it MUST get a new sessionId. Chips are
    // written with groupId = sessionId and the card merges chips sharing a
    // groupId, so reusing the id made every later commit collapse into the
    // first chip instead of appearing as its own entry.
    set((state) =>
      state.boqTargeting
        ? {
            boqTargeting: {
              ...state.boqTargeting,
              sessionId: generateClientId(),
              pendingValue: null,
              pendingMeasurementIds: [],
              pendingTotal: 0,
            },
          }
        : state
    );
  },

  setMeasurementBoqBinding: (measurementId, elementId, itemId) => {
    set((state) => ({
      takeoffItems: state.takeoffItems.map((item) => ({
        ...item,
        measurements: item.measurements.map((m) => {
          if (m.id !== measurementId) return m;
          if (elementId && itemId) {
            return { ...m, boqElementId: elementId, boqItemId: itemId };
          }
          // Clear the binding.
          const { boqElementId: _e, boqItemId: _i, ...rest } = m;
          void _e;
          void _i;
          return rest as Measurement;
        }),
      })),
    }));
    const projectId = get().currentProjectId;
    if (projectId) {
      syncQueue.enqueue({
        kind: 'measurement.update',
        projectId,
        clientUuid: measurementId,
        patch: {
          boq_element_id: elementId,
          boq_item_id: itemId,
        },
      });
    }
    get().triggerAutoSave();
  },

  bindMeasurementToItem: (measurementId, elementId, itemId, mode = 'add', value, sessionId) => {
    const projectId = get().currentProjectId;
    const previousBoqElements = get().boqElements;
    const ids = Array.isArray(measurementId) ? measurementId : [measurementId];
    const idSet = new Set(ids);

    set((state) => {
      // Bind every measurement id in the set.
      const nextItems = state.takeoffItems.map((takeoffItem) => {
        const nextMeasurements = takeoffItem.measurements.map((m) => {
          if (!idSet.has(m.id)) return m;
          return { ...m, boqElementId: elementId, boqItemId: itemId };
        });
        return nextMeasurements === takeoffItem.measurements
          ? takeoffItem
          : { ...takeoffItem, measurements: nextMeasurements };
      });

      // Compute the value for the history chip: use the provided value
      // (session total) when given, otherwise derive from the single measurement.
      let chipValue = value ?? null;
      if (chipValue === null && ids.length === 1) {
        for (const takeoffItem of state.takeoffItems) {
          const m = takeoffItem.measurements.find((m) => m.id === ids[0]);
          if (m) { chipValue = Math.abs(m.quantity).toFixed(2); break; }
        }
      }
      if (chipValue === null) return { takeoffItems: nextItems };

      // One history chip for the whole session — remove any stale entries
      // for any of the ids first.
      const nextElements = state.boqElements.map((element) => {
        if (element.id !== elementId) return element;
        return {
          ...element,
          items: element.items.map((item) => {
            if (item.id !== itemId) return item;
            const withoutStale = item.history.filter(
              (entry) => !entry.sourceMeasurementId || !idSet.has(entry.sourceMeasurementId)
            );
            withoutStale.push({
              id: generateClientId(),
              value: chipValue!,
              isDeduct: mode === 'deduct',
              // Link the first measurement id so plan-side edits still propagate.
              sourceMeasurementId: ids[0],
              ...(sessionId ? { groupId: sessionId } : {}),
            });
            return { ...item, history: withoutStale };
          }),
        };
      });

      return { takeoffItems: nextItems, boqElements: nextElements };
    });

    if (projectId) {
      for (const id of ids) {
        syncQueue.enqueue({
          kind: 'measurement.update',
          projectId,
          clientUuid: id,
          patch: { boq_element_id: elementId, boq_item_id: itemId },
        });
      }
    }
    enqueueBoqOpsFromDiff(previousBoqElements);
    get().triggerAutoSave();
  },

  unbindMeasurement: (measurementId) => {
    const projectId = get().currentProjectId;
    const previousBoqElements = get().boqElements;

    set((state) => {
      const nextItems = state.takeoffItems.map((item) => {
        const nextMeasurements = item.measurements.map((m) => {
          if (m.id !== measurementId) return m;
          const { boqElementId: _e, boqItemId: _i, ...rest } = m;
          void _e;
          void _i;
          return rest as Measurement;
        });
        return nextMeasurements === item.measurements
          ? item
          : { ...item, measurements: nextMeasurements };
      });
      const nextElements = state.boqElements.map((element) => ({
        ...element,
        items: element.items.map((item) => ({
          ...item,
          history: item.history.filter(
            (entry) => entry.sourceMeasurementId !== measurementId
          ),
        })),
      }));
      return { takeoffItems: nextItems, boqElements: nextElements };
    });

    if (projectId) {
      syncQueue.enqueue({
        kind: 'measurement.update',
        projectId,
        clientUuid: measurementId,
        patch: { boq_element_id: null, boq_item_id: null },
      });
    }
    enqueueBoqOpsFromDiff(previousBoqElements);
    get().triggerAutoSave();
  },

  ensureCanvasItemId: () => {
    const state = get();
    const existing = state.takeoffItems.find((item) => item.id === CANVAS_TAKEOFF_ITEM_ID);
    if (existing) {
      return CANVAS_TAKEOFF_ITEM_ID;
    }

    const tool =
      state.activeTool === 'arc' ? 'polyline' : (state.activeTool ?? 'linear');
    const canvasItem: TakeoffItem = {
      id: CANVAS_TAKEOFF_ITEM_ID,
      name: 'Canvas markups',
      type: tool,
      color: state.activeColor,
      measurements: [],
      totalQuantity: 0,
      unit: unitForTakeoffMode(tool),
    };

    set((prev) => ({
      takeoffItems: [...prev.takeoffItems, canvasItem],
    }));

    return CANVAS_TAKEOFF_ITEM_ID;
  },

  addMeasurement: (itemId, measurement) => {
    // Stamp the section group: shapes drawn in one measuring session (or
    // aimed at an existing group via "New section") merge into one pill.
    if (!measurement.sectionGroupId && measurement.type !== 'count') {
      const state0 = get();
      const groupId = state0.pendingSectionGroup ?? state0.measureSessionId;
      if (groupId) measurement = { ...measurement, sectionGroupId: groupId };
    }
    executeCommand({
      execute: () => {
        set((state) => {
          // Assign a stable per-type sequence number (never reused) so the
          // auto label "Area 3" stays fixed even after deletions.
          const owningItem = state.takeoffItems.find((i) => i.id === itemId);
          const mType = measurement.type ?? owningItem?.type ?? 'linear';
          const withSeq: Measurement =
            typeof measurement.seq === 'number'
              ? measurement
              : { ...measurement, seq: nextSeqForType(state.takeoffItems, mType) };
          return {
            takeoffItems: state.takeoffItems.map((item) => {
              if (item.id === itemId) {
                return {
                  ...item,
                  measurements: [...item.measurements, withSeq],
                  totalQuantity: item.totalQuantity + withSeq.quantity,
                };
              }
              return item;
            }),
          };
        });
        const projectId = get().currentProjectId;
        const activePlanId = get().activePlanId;
        if (projectId && (measurement.planId || activePlanId)) {
          const body = measurementCreateBodyFromStore(
            itemId,
            activePlanId ?? '',
            measurement
          );
          if (body) syncQueue.enqueue({ kind: 'measurement.create', projectId, body });
        }
        // Commit-on-demand: a drawn measurement only STAGES its value into the
        // takeoff input (the running expression). It does NOT create a history
        // chip yet — that happens when the user clicks Add/Deduct. This lets the
        // user type extra math (e.g. "+ 76") onto the drawn value and commit
        // once, instead of the draw auto-committing a chip AND the edited input
        // committing a second one (which produced duplicate chips).
        const target = get().boqTargeting;
        if (target) {
          const rawValue = Math.abs(measurement.quantity).toFixed(2);
          const isDeduct = target.mode === 'deduct';

          // Append this measurement's value to the running takeoff expression.
          const term = `${isDeduct ? '-' : '+'} ${rawValue}`;
          const newExpr = target.pendingValue
            ? `${target.pendingValue} ${term}`
            : (isDeduct ? `- ${rawValue}` : rawValue);
          const newIds = [...target.pendingMeasurementIds, measurement.id];
          set((state) =>
            state.boqTargeting
              ? {
                  boqTargeting: {
                    ...state.boqTargeting,
                    pendingTotal:
                      target.pendingTotal +
                      (isDeduct ? -1 : 1) * Math.abs(measurement.quantity),
                    pendingValue: newExpr,
                    pendingMeasurementIds: newIds,
                  },
                }
              : state
          );
        }
      },
      undo: () => {
        const boqBefore = get().boqElements;
        set((state) => {
          // Roll back the staged takeoff expression if this measurement was
          // staged but not yet committed (commit-on-demand). Rebuild the running
          // expression from the remaining pending measurement ids.
          let boqTargeting = state.boqTargeting;
          if (
            boqTargeting &&
            boqTargeting.pendingMeasurementIds.includes(measurement.id)
          ) {
            const remainingIds = boqTargeting.pendingMeasurementIds.filter(
              (id) => id !== measurement.id
            );
            boqTargeting = {
              ...boqTargeting,
              pendingMeasurementIds: remainingIds,
              pendingTotal: boqTargeting.pendingTotal - measurement.quantity,
              // Simplest correct rollback: clear the expression when nothing is
              // left staged; otherwise strip this value's trailing term.
              pendingValue: remainingIds.length === 0 ? null : boqTargeting.pendingValue,
            };
          }
          return {
            boqTargeting,
            takeoffItems: state.takeoffItems.map((item) => {
              if (item.id === itemId) {
                return {
                  ...item,
                  measurements: item.measurements.filter((m) => m.id !== measurement.id),
                  totalQuantity: item.totalQuantity - measurement.quantity,
                };
              }
              return item;
            }),
            // Safety net: also drop any history chip that referenced this
            // measurement (only relevant for already-committed measurements).
            boqElements: state.boqElements.map((element) => ({
              ...element,
              items: element.items.map((item) => ({
                ...item,
                history: item.history.filter(
                  (entry) => entry.sourceMeasurementId !== measurement.id
                ),
              })),
            })),
          };
        });
        enqueueBoqOpsFromDiff(boqBefore);
        const projectId = get().currentProjectId;
        if (projectId) {
          syncQueue.enqueue({
            kind: 'measurement.delete',
            projectId,
            clientUuid: measurement.id,
          });
        }
      },
      description: 'Add measurement',
    });
  },

  removeMeasurement: (itemId, measurementId) => {
    const state = get();
    const item = state.takeoffItems.find((i) => i.id === itemId);
    if (!item) return;

    const measurement = item.measurements.find((m) => m.id === measurementId);
    if (!measurement) return;

    executeCommand({
      execute: () => {
        const boqBefore = get().boqElements;
        set((state) => ({
          takeoffItems: state.takeoffItems.map((item) => {
            if (item.id === itemId) {
              return {
                ...item,
                measurements: item.measurements.filter((m) => m.id !== measurementId),
                totalQuantity: item.totalQuantity - measurement.quantity,
              };
            }
            return item;
          }),
          // Drop any BOQ history entry that mirrored this measurement.
          boqElements: state.boqElements.map((element) => ({
            ...element,
            items: element.items.map((item) => ({
              ...item,
              history: item.history.filter(
                (entry) => entry.sourceMeasurementId !== measurementId
              ),
            })),
          })),
        }));
        const projectId = get().currentProjectId;
        if (projectId) {
          syncQueue.enqueue({
            kind: 'measurement.delete',
            projectId,
            clientUuid: measurementId,
          });
        }
        enqueueBoqOpsFromDiff(boqBefore);
      },
      undo: () => {
        set((state) => ({
          takeoffItems: state.takeoffItems.map((item) => {
            if (item.id === itemId) {
              return {
                ...item,
                measurements: [...item.measurements, measurement],
                totalQuantity: item.totalQuantity + measurement.quantity,
              };
            }
            return item;
          }),
        }));
        // If the measurement was bound before deletion, restore the
        // history entry too. (Best-effort: uses the measurement's current
        // quantity — matches the current-state contract.)
        if (measurement.boqElementId && measurement.boqItemId) {
          get().bindMeasurementToItem(
            measurement.id,
            measurement.boqElementId,
            measurement.boqItemId
          );
        }
        const projectId = get().currentProjectId;
        const activePlanId = get().activePlanId;
        if (projectId) {
          const body = measurementCreateBodyFromStore(
            itemId,
            activePlanId ?? '',
            measurement
          );
          if (body) syncQueue.enqueue({ kind: 'measurement.create', projectId, body });
        }
      },
      description: 'Remove measurement',
    });
  },

  toggleMeasurementHidden: (itemId, measurementId) => {
    let nextHidden = false;
    set((state) => ({
      takeoffItems: state.takeoffItems.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          measurements: item.measurements.map((m) => {
            if (m.id === measurementId) {
              nextHidden = !m.hidden;
              return { ...m, hidden: nextHidden };
            }
            return m;
          }),
        };
      }),
    }));
    get().triggerAutoSave();
    const projectId = get().currentProjectId;
    if (projectId) {
      syncQueue.enqueue({
        kind: 'measurement.update',
        projectId,
        clientUuid: measurementId,
        patch: { hidden: nextHidden },
      });
    }
  },

  renameMeasurement: (itemId, measurementId, name) => {
    const trimmed = name.trim();
    const nextName = trimmed === '' ? undefined : trimmed;
    let found = false;
    set((state) => ({
      takeoffItems: state.takeoffItems.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          measurements: item.measurements.map((m) => {
            if (m.id !== measurementId) return m;
            found = true;
            return { ...m, name: nextName };
          }),
        };
      }),
    }));
    if (!found) return;
    get().triggerAutoSave();
    const projectId = get().currentProjectId;
    if (projectId) {
      // name lives in the metadata blob; send it there.
      const m = get()
        .takeoffItems.find((i) => i.id === itemId)
        ?.measurements.find((mm) => mm.id === measurementId);
      syncQueue.enqueue({
        kind: 'measurement.update',
        projectId,
        clientUuid: measurementId,
        patch: {
          // Full canonical blob — the server stores metadata wholesale, so a
          // partial rebuild here silently dropped fields (the arc flag, once).
          metadata: {
            ...(m ? measurementMetadataBody(m) : {}),
            lastModified: new Date().toISOString(),
            name: nextName,
          },
        },
      });
    }
  },

  addDeductionToMeasurement: (itemId, measurementId, deduction) => {
    const state = get();
    const item = state.takeoffItems.find((i) => i.id === itemId);
    const measurement = item?.measurements.find((m) => m.id === measurementId);
    if (!item || !measurement) return;

    const pageScale = state.scales[measurement.page] ?? null;
    const prevDeductions = measurement.deductions ?? [];
    const nextDeductions = [...prevDeductions, deduction];
    const previousQuantity = measurement.quantity;
    const pixelArea = calculateAreaWithDeductions(measurement.points, nextDeductions);
    const nextQuantity =
      pageScale && pageScale > 0 ? pixelArea / (pageScale * pageScale) : pixelArea;
    const quantityDelta = nextQuantity - previousQuantity;

    const applyDeductions = (deductions: Point[][], quantity: number) => {
      set((current) => ({
        takeoffItems: current.takeoffItems.map((ti) => {
          if (ti.id !== itemId) return ti;
          const nextMeasurements = ti.measurements.map((m) =>
            m.id === measurementId
              ? {
                  ...m,
                  deductions,
                  quantity,
                  metadata: {
                    ...m.metadata,
                    createdAt: m.metadata?.createdAt ?? new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                  },
                }
              : m
          );
          return {
            ...ti,
            measurements: nextMeasurements,
            totalQuantity: ti.totalQuantity + (quantity - previousQuantity),
          };
        }),
      }));
      get().triggerAutoSave();
      const projectId = get().currentProjectId;
      if (projectId) {
        syncQueue.enqueue({
          kind: 'measurement.update',
          projectId,
          clientUuid: measurementId,
          patch: {
            deductions: deductions.length > 0 ? deductions : null,
            quantity,
          },
        });
      }
    };

    executeCommand({
      execute: () => {
        applyDeductions(nextDeductions, nextQuantity);
        refreshPendingSessionTotal(measurementId);
      },
      undo: () => {
        set((current) => ({
          takeoffItems: current.takeoffItems.map((ti) => {
            if (ti.id !== itemId) return ti;
            const nextMeasurements = ti.measurements.map((m) =>
              m.id === measurementId
                ? { ...m, deductions: prevDeductions.length > 0 ? prevDeductions : undefined, quantity: previousQuantity }
                : m
            );
            return {
              ...ti,
              measurements: nextMeasurements,
              totalQuantity: ti.totalQuantity - quantityDelta,
            };
          }),
        }));
        get().triggerAutoSave();
        const projectId = get().currentProjectId;
        if (projectId) {
          syncQueue.enqueue({
            kind: 'measurement.update',
            projectId,
            clientUuid: measurementId,
            patch: {
              deductions: prevDeductions.length > 0 ? prevDeductions : null,
              quantity: previousQuantity,
            },
          });
        }
        // Quantities are restored above; recomputing lands the takeoff input
        // back on the pre-deduction total.
        refreshPendingSessionTotal(measurementId);
      },
      description: 'Add deduction',
    });
  },

  removeDeductionFromMeasurement: (itemId, measurementId, deductionIndex) => {
    const state = get();
    const item = state.takeoffItems.find((i) => i.id === itemId);
    const measurement = item?.measurements.find((m) => m.id === measurementId);
    if (!item || !measurement || !measurement.deductions) return;
    if (deductionIndex < 0 || deductionIndex >= measurement.deductions.length) return;

    const pageScale = state.scales[measurement.page] ?? null;
    const prevDeductions = measurement.deductions;
    const nextDeductions = prevDeductions.filter((_, i) => i !== deductionIndex);
    const previousQuantity = measurement.quantity;
    const pixelArea = calculateAreaWithDeductions(measurement.points, nextDeductions);
    const nextQuantity =
      pageScale && pageScale > 0 ? pixelArea / (pageScale * pageScale) : pixelArea;
    const quantityDelta = nextQuantity - previousQuantity;

    const enqueueDeductionsSync = (deductions: Point[][], quantity: number) => {
      const projectId = get().currentProjectId;
      if (!projectId) return;
      syncQueue.enqueue({
        kind: 'measurement.update',
        projectId,
        clientUuid: measurementId,
        patch: { deductions: deductions.length > 0 ? deductions : null, quantity },
      });
    };

    executeCommand({
      execute: () => {
        set((current) => ({
          takeoffItems: current.takeoffItems.map((ti) => {
            if (ti.id !== itemId) return ti;
            const nextMeasurements = ti.measurements.map((m) =>
              m.id === measurementId
                ? {
                    ...m,
                    deductions: nextDeductions.length > 0 ? nextDeductions : undefined,
                    quantity: nextQuantity,
                  }
                : m
            );
            return {
              ...ti,
              measurements: nextMeasurements,
              totalQuantity: ti.totalQuantity + quantityDelta,
            };
          }),
        }));
        get().triggerAutoSave();
        enqueueDeductionsSync(nextDeductions, nextQuantity);
        // Removing a deduction raises the quantity back; keep the live
        // takeoff input in step (same refresh as adding a deduction).
        refreshPendingSessionTotal(measurementId);
      },
      undo: () => {
        set((current) => ({
          takeoffItems: current.takeoffItems.map((ti) => {
            if (ti.id !== itemId) return ti;
            const nextMeasurements = ti.measurements.map((m) =>
              m.id === measurementId
                ? { ...m, deductions: prevDeductions, quantity: previousQuantity }
                : m
            );
            return {
              ...ti,
              measurements: nextMeasurements,
              totalQuantity: ti.totalQuantity - quantityDelta,
            };
          }),
        }));
        get().triggerAutoSave();
        enqueueDeductionsSync(prevDeductions, previousQuantity);
        refreshPendingSessionTotal(measurementId);
      },
      description: 'Remove deduction',
    });
  },

  clearScale: (page) => {
    const state = get();
    if (state.scales[page] === undefined && !state.calibrationLines[page]) return;
    set((st) => {
      const scales = { ...st.scales };
      const calibrationLines = { ...st.calibrationLines };
      delete scales[page];
      delete calibrationLines[page];
      return { scales, calibrationLines };
    });
    get().triggerAutoSave();
    const projectId = state.currentProjectId;
    const planUuid = state.activePlanId;
    if (projectId && planUuid) {
      syncQueue.enqueue({ kind: 'calibration.delete', projectId, planUuid, page });
    }
  },

  setScale: (page, scale) => {
    const state = get();
    const previousScale = state.scales[page];
    
    executeCommand({
      execute: () => {
        set((state) => ({
          scales: { ...state.scales, [page]: scale },
        }));
      },
      undo: () => {
        if (previousScale !== undefined) {
          set((state) => ({
            scales: { ...state.scales, [page]: previousScale },
          }));
        } else {
          set((state) => {
            const newScales = { ...state.scales };
            delete newScales[page];
            return { scales: newScales };
          });
        }
      },
      description: `Set scale for page ${page}`,
    });
  },

  setCalibrationLine: (page, line) => {
    const state = get();
    const previousLine = state.calibrationLines[page];

    executeCommand({
      execute: () => {
        set((state) => ({
          calibrationLines: { ...state.calibrationLines, [page]: line },
        }));
        // Sync-side: emit calibration.upsert if we know which plan this is on
        // and a scale has been set for this page.
        const projectId = get().currentProjectId;
        const activePlanId = get().activePlanId;
        const scale = get().scales[page];
        if (projectId && activePlanId && typeof scale === 'number') {
          syncQueue.enqueue({
            kind: 'calibration.upsert',
            projectId,
            planUuid: activePlanId,
            page,
            body: calibrationUpsertBodyFromStore(scale, line),
          });
        }
      },
      undo: () => {
        if (previousLine !== undefined) {
          set((state) => ({
            calibrationLines: { ...state.calibrationLines, [page]: previousLine },
          }));
        } else {
          set((state) => {
            const newLines = { ...state.calibrationLines };
            delete newLines[page];
            return { calibrationLines: newLines };
          });
        }
        const projectId = get().currentProjectId;
        const activePlanId = get().activePlanId;
        if (projectId && activePlanId) {
          if (previousLine !== undefined) {
            const scale = get().scales[page];
            if (typeof scale === 'number') {
              syncQueue.enqueue({
                kind: 'calibration.upsert',
                projectId,
                planUuid: activePlanId,
                page,
                body: calibrationUpsertBodyFromStore(scale, previousLine),
              });
            }
          } else {
            syncQueue.enqueue({
              kind: 'calibration.delete',
              projectId,
              planUuid: activePlanId,
              page,
            });
          }
        }
      },
      description: `Set calibration line for page ${page}`,
    });
  },

  rotatePage: (page, delta, transformPoints) => {
    set((state) => {
      const current = state.rotations[page] ?? 0;
      const next = ((current + delta) % 360 + 360) % 360;
      const newRotations = { ...state.rotations, [page]: next };

      if (!transformPoints) return { rotations: newRotations };

      // Remap all measurement points on this page to the rotated coordinate space
      const activePlanId = state.activePlanId;
      const takeoffItems = state.takeoffItems.map((item) => ({
        ...item,
        measurements: item.measurements.map((m) => {
          if (m.planId !== activePlanId || m.page !== page) return m;
          return { ...m, points: m.points.map(transformPoints) };
        }),
      }));

      return { rotations: newRotations, takeoffItems };
    });
    get().triggerAutoSave();
  },

  rotateAllPages: (delta, transformPointsByPage) => {
    const state = get();
    const numPages = state.numPages || 1;
    const newRotations: Record<number, number> = {};
    for (let p = 1; p <= numPages; p++) {
      const current = state.rotations[p] ?? 0;
      newRotations[p] = ((current + delta) % 360 + 360) % 360;
    }

    if (!transformPointsByPage) {
      set({ rotations: newRotations });
      get().triggerAutoSave();
      return;
    }

    const activePlanId = state.activePlanId;
    const takeoffItems = state.takeoffItems.map((item) => ({
      ...item,
      measurements: item.measurements.map((m) => {
        if (m.planId !== activePlanId) return m;
        const fn = transformPointsByPage[m.page];
        if (!fn) return m;
        return { ...m, points: m.points.map(fn) };
      }),
    }));

    set({ rotations: newRotations, takeoffItems });
    get().triggerAutoSave();
  },

  setCalibrationMode: (mode) => set({ calibrationMode: mode }),

  setCurrentPage: (page) => {
    set({ currentPage: page });
  },

  setNumPages: (pages) => {
    set({ numPages: pages });
  },

  setBackgroundImage: (image) => {
    set({ backgroundImage: image });
  },

  setPricing: (pricing) => {
    set((state) => ({
      pricing: {
        ...state.pricing,
        ...pricing,
      },
    }));
    get().triggerAutoSave();
  },

  addBoqElement: () => {
    const state = get();
    const previousElements = [...state.boqElements];
    const newElement = createEmptyBoqElement(state.boqElements.length);
    executeCommand({
      execute: () => {
        set({ boqElements: [...state.boqElements, newElement] });
        enqueueBoqOpsFromDiff(previousElements);
      },
      undo: () => {
        const before = get().boqElements;
        set({ boqElements: previousElements });
        enqueueBoqOpsFromDiff(before);
      },
      description: `Add ${newElement.title}`,
    });
  },

  updateBoqElement: (elementId, updates) => {
    const state = get();
    const element = state.boqElements.find((e) => e.id === elementId);
    if (!element) return;
    const previousElement = { ...element, items: [...element.items] };
    const previousElements = state.boqElements.map((el) => ({ ...el }));
    executeCommand({
      execute: () => {
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId ? { ...el, ...updates } : el
          ),
        }));
        enqueueBoqOpsFromDiff(previousElements);
      },
      undo: () => {
        const before = get().boqElements;
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId ? previousElement : el
          ),
        }));
        enqueueBoqOpsFromDiff(before);
      },
      description: `Update ${element.title}`,
    });
  },

  addElementItem: (elementId) => {
    const state = get();
    const element = state.boqElements.find((e) => e.id === elementId);
    if (!element) return;
    const newItem = createEmptyBoqItem();
    const previousElements = state.boqElements.map((el) => ({
      ...el,
      items: [...el.items],
    }));
    executeCommand({
      execute: () => {
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId ? { ...el, items: [...el.items, newItem] } : el
          ),
        }));
        enqueueBoqOpsFromDiff(previousElements);
      },
      undo: () => {
        const before = get().boqElements;
        set({ boqElements: previousElements });
        enqueueBoqOpsFromDiff(before);
      },
      description: `Add item to ${element.title}`,
    });
  },

  updateElementItem: (elementId, itemId, updates) => {
    const state = get();
    const element = state.boqElements.find((e) => e.id === elementId);
    const item = element?.items.find((i) => i.id === itemId);
    if (!element || !item) return;
    const previousElements = state.boqElements.map((el) => ({
      ...el,
      items: [...el.items],
    }));

    // Unlink-on-edit rule: if the incoming history has an entry whose value
    // differs from the previous version's linked entry, strip the
    // sourceMeasurementId AND clear the ids on the referenced measurement.
    // Mobile users can only edit history (they can't see the plan) — this
    // makes the divergence explicit instead of letting the plan and BOQ
    // silently disagree.
    let sanitizedUpdates = updates;
    const unlinkMeasurementIds = new Set<string>();
    if (updates.history) {
      const prevById = new Map(item.history.map((h) => [h.id, h]));
      const nextHistory = updates.history.map((next) => {
        const prev = prevById.get(next.id);
        if (
          next.sourceMeasurementId &&
          prev?.sourceMeasurementId === next.sourceMeasurementId &&
          prev.value !== next.value
        ) {
          unlinkMeasurementIds.add(next.sourceMeasurementId);
          const { sourceMeasurementId: _stripped, ...unlinked } = next;
          void _stripped;
          return unlinked;
        }
        return next;
      });
      if (unlinkMeasurementIds.size > 0) {
        sanitizedUpdates = { ...updates, history: nextHistory };
      }
    }

    executeCommand({
      execute: () => {
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId
              ? {
                  ...el,
                  items: el.items.map((i) =>
                    i.id === itemId ? { ...i, ...sanitizedUpdates } : i
                  ),
                }
              : el
          ),
        }));
        // Strip the boq binding on any measurement we just unlinked and
        // enqueue the sync so mobile agrees with the plan.
        if (unlinkMeasurementIds.size > 0) {
          const projectId = get().currentProjectId;
          set((current) => ({
            takeoffItems: current.takeoffItems.map((takeoffItem) => ({
              ...takeoffItem,
              measurements: takeoffItem.measurements.map((m) => {
                if (!unlinkMeasurementIds.has(m.id)) return m;
                const { boqElementId: _e, boqItemId: _i, ...rest } = m;
                void _e;
                void _i;
                return rest as Measurement;
              }),
            })),
          }));
          if (projectId) {
            for (const mid of unlinkMeasurementIds) {
              syncQueue.enqueue({
                kind: 'measurement.update',
                projectId,
                clientUuid: mid,
                patch: { boq_element_id: null, boq_item_id: null },
              });
            }
          }
        }
        enqueueBoqOpsFromDiff(previousElements);
      },
      undo: () => {
        const before = get().boqElements;
        set({ boqElements: previousElements });
        enqueueBoqOpsFromDiff(before);
      },
      description: `Update item ${item.header || item.description || 'Item'}`,
    });
  },

  deleteElementItem: (elementId, itemId) => {
    const state = get();
    const element = state.boqElements.find((e) => e.id === elementId);
    if (!element) return;

    // Deleting the LAST item in an element removes the whole (now-empty)
    // element — but never the final element, so the BOQ always keeps at least
    // one element with one item to work in.
    const isLastItemInElement = element.items.length <= 1;
    const isLastElement = state.boqElements.length <= 1;
    if (isLastItemInElement && isLastElement) return;

    const previousElements = state.boqElements.map((el) => ({
      ...el,
      items: [...el.items],
    }));

    const apply = (current: { boqElements: BoqElementData[] }) =>
      isLastItemInElement
        ? {
            // Removing an element shifts the ones after it up, so auto-titled
            // elements are renumbered to match their new position. User-named
            // elements ("DPM Works") keep their names.
            boqElements: renumberAutoElements(
              current.boqElements.filter((el) => el.id !== elementId)
            ),
          }
        : {
            boqElements: current.boqElements.map((el) =>
              el.id === elementId
                ? { ...el, items: el.items.filter((i) => i.id !== itemId) }
                : el
            ),
          };

    executeCommand({
      execute: () => {
        set(apply);
        enqueueBoqOpsFromDiff(previousElements);
      },
      undo: () => {
        const before = get().boqElements;
        set({ boqElements: previousElements });
        enqueueBoqOpsFromDiff(before);
      },
      description: isLastItemInElement ? 'Delete element' : 'Delete item',
    });
  },

  duplicateElementItem: (elementId, itemId) => {
    const state = get();
    const element = state.boqElements.find((e) => e.id === elementId);
    const source = element?.items.find((i) => i.id === itemId);
    if (!element || !source) return;
    const copy: EstimationCardData = {
      ...source,
      id: generateClientId(),
      history: source.history.map((h) => ({ ...h, id: generateClientId() })),
    };
    const sourceIndex = element.items.findIndex((i) => i.id === itemId);
    const previousElements = state.boqElements.map((el) => ({
      ...el,
      items: [...el.items],
    }));
    executeCommand({
      execute: () => {
        set((current) => ({
          boqElements: current.boqElements.map((el) => {
            if (el.id !== elementId) return el;
            const items = [...el.items];
            items.splice(sourceIndex + 1, 0, copy);
            return { ...el, items };
          }),
        }));
        enqueueBoqOpsFromDiff(previousElements);
      },
      undo: () => {
        const before = get().boqElements;
        set({ boqElements: previousElements });
        enqueueBoqOpsFromDiff(before);
      },
      description: 'Duplicate item',
    });
  },

  // Undo/Redo actions
  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;

    const command = state.undoStack[state.undoStack.length - 1];
    command.undo();

    set((state) => {
      const newUndoStack = state.undoStack.slice(0, -1);
      const newRedoStack = [...state.redoStack, command];
      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: newUndoStack.length > 0,
        canRedo: true,
      };
    });
    get().triggerAutoSave();
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;

    const command = state.redoStack[state.redoStack.length - 1];
    command.execute();

    set((state) => {
      const newRedoStack = state.redoStack.slice(0, -1);
      const newUndoStack = [...state.undoStack, command];
      return {
        undoStack: newUndoStack,
        redoStack: newRedoStack,
        canUndo: true,
        canRedo: newRedoStack.length > 0,
      };
    });
    get().triggerAutoSave();
  },

  clearHistory: () => {
    set({
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    });
  },

  reset: () => {
    clearAllPlanPdfs();
    set({
      ...initialState,
      undoStack: [],
      redoStack: [],
      canUndo: false,
      canRedo: false,
    });
  },
  };
});

// Debug handle for development sessions only.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__takeoffStore = useTakeoffStore;
}
