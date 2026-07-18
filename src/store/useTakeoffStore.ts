import { create } from 'zustand';
import type {
  TakeoffItem,
  TakeoffMode,
  Measurement,
  CalibrationLine,
  EstimationCardData,
  BoqElementData,
  BoqPricing,
  ProjectPlan,
  PlanDiscipline,
} from '@/types/takeoff';
import {
  emptyPlanDocumentState,
  type PlanDocumentState,
  hydrateActivePlanView,
  resolvePlanBackgroundForCanvas,
} from '@/utils/planDocument';
import { inferPlanMediaKind } from '@/utils/planMediaLoader';
import { mergePlanLists } from '@/utils/planMapper';
import { clearAllPlanPdfs, clearPlanPdf } from '@/utils/planPdfCache';
import { MARKUP_COLORS } from '@/constants/takeoffDesign';
import { createEmptyBoqElement, createEmptyBoqItem } from '@/utils/boqCalculations';
import { loadProjectFromStorage, autoSaveProject } from '@/utils/persistence';
import { generateClientId } from '@/utils/id';
import { syncQueue } from '@/services/syncQueue';
import {
  boqTreeOpsDiff,
  calibrationUpsertBodyFromStore,
  measurementCreateBodyFromStore,
} from '@/utils/entitySyncMapper';
import {
  CANVAS_TAKEOFF_ITEM_ID,
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
  activeTool: TakeoffMode | null;
  activeColor: string;
  activeStrokeWidth: number;

  // Calibration
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  calibrationMode: boolean;

  // Canvas state (active plan view)
  currentPage: number;
  numPages: number;
  backgroundImage: string | null;
  /** Per-page rotation for the active plan (degrees: 0, 90, 180, 270). */
  rotations: Record<number, number>;
  plans: ProjectPlan[];
  activePlanId: string | null;
  planStates: Record<string, PlanDocumentState>;
  /** Client-side tombstones: ids of plans the user deleted. Suppressed
   * from every server merge path so the plan doesn't get resurrected
   * on the next pull if the server DELETE hasn't propagated yet. */
  deletedPlanIds: string[];

  boqElements: BoqElementData[];
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
    /** Numeric string of the most recently measured value, waiting for
     * the user to commit (Add/Deduct/Enter) or discard (Esc). null when
     * nothing is pending. */
    pendingValue: string | null;
    /** Client uuid of the plan measurement that produced pendingValue.
     * When the user commits, this is passed as `sourceMeasurementId` on
     * the history chip so delete/edit propagation stays wired. */
    pendingMeasurementId: string | null;
  } | null;

  /** Change just the add/deduct mode of the current targeting without
   * touching element/item/unit. Called when the user clicks Add or
   * Deduct in the toolbar while Measure is active. */
  setBoqTargetingMode: (mode: 'add' | 'deduct') => void;
  /** Populate the staging slot after a measurement commits. */
  setBoqTargetingPending: (value: string | null, measurementId: string | null) => void;
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
  applyServerSync: (updates: {
    boqElements?: BoqElementData[];
    takeoffItems?: TakeoffItem[];
    scales?: Record<number, number>;
    calibrationLines?: Record<number, CalibrationLine>;
    currentPage?: number;
    numPages?: number;
    plans?: ProjectPlan[];
    activePlanId?: string | null;
    planStates?: Record<string, PlanDocumentState>;
  }) => void;

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
  setActiveTool: (tool: TakeoffMode | null) => void;
  setActiveColor: (color: string) => void;
  setActiveStrokeWidth: (width: number) => void;
  setFocusedBoqCard: (card: { elementId: string; itemId: string; unit: string } | null) => void;
  ensureCanvasItemId: () => string;

  addMeasurement: (itemId: string, measurement: Measurement) => void;
  removeMeasurement: (itemId: string, measurementId: string) => void;
  toggleMeasurementHidden: (itemId: string, measurementId: string) => void;

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
  /** Bind an existing measurement to a BOQ item. Adds a corresponding
   * history entry on the target item with sourceMeasurementId set.
   * `mode` defaults to 'add'; passing 'deduct' commits the entry as
   * isDeduct: true. */
  bindMeasurementToItem: (
    measurementId: string,
    elementId: string,
    itemId: string,
    mode?: 'add' | 'deduct'
  ) => void;
  /** Remove the binding on a measurement AND drop the corresponding
   * history entry from whatever item it was on. */
  unbindMeasurement: (measurementId: string) => void;

  setScale: (page: number, scale: number) => void;
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
  activeColor: MARKUP_COLORS[0],
  activeStrokeWidth: 2,
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
  focusedBoqCard: null,
  boqTargeting: null,
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
  const enqueueBoqOpsFromDiff = (before: BoqElementData[]) => {
    const projectId = get().currentProjectId;
    if (!projectId) return;
    const after = get().boqElements;
    for (const op of boqTreeOpsDiff(projectId, before, after)) {
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
    const takeoffItems = state.takeoffItems.map((item) => {
      const kept = item.measurements.filter((m) => m.planId !== planId);
      if (kept.length === item.measurements.length) return item;
      const totalQuantity = kept.reduce((sum, m) => sum + m.quantity, 0);
      return { ...item, measurements: kept, totalQuantity };
    });

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

  applyServerSync: (updates) => {
    set((state) => {
      const merged = {
        ...state,
        ...(updates.boqElements !== undefined ? { boqElements: updates.boqElements } : {}),
        ...(updates.takeoffItems !== undefined ? { takeoffItems: updates.takeoffItems } : {}),
        ...(updates.scales !== undefined ? { scales: updates.scales } : {}),
        ...(updates.calibrationLines !== undefined
          ? { calibrationLines: updates.calibrationLines }
          : {}),
        ...(updates.currentPage !== undefined ? { currentPage: updates.currentPage } : {}),
        ...(updates.numPages !== undefined ? { numPages: updates.numPages } : {}),
        ...(updates.plans !== undefined
          ? { plans: mergePlanLists(state.plans, updates.plans, state.deletedPlanIds) }
          : {}),
        ...(updates.activePlanId !== undefined ? { activePlanId: updates.activePlanId } : {}),
        ...(updates.planStates !== undefined ? { planStates: updates.planStates } : {}),
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      };
      const view = hydrateActivePlanView(merged);
      return { ...merged, ...view };
    });

    const projectId = get().currentProjectId;
    if (projectId) {
      const latest = get();
      const planStates = snapshotActivePlanState(latest);
      autoSaveProject(projectId, {
        takeoffItems: latest.takeoffItems,
        scales: latest.scales,
        calibrationLines: latest.calibrationLines,
        currentPage: latest.currentPage,
        numPages: latest.numPages,
        backgroundImage: latest.backgroundImage,
        plans: latest.plans,
        activePlanId: latest.activePlanId,
        planStates,
        deletedPlanIds: latest.deletedPlanIds,
        boqElements: latest.boqElements,
        pricing: latest.pricing,
        rotations: latest.rotations,
      });
    }
  },

  setTakeoffItems: (items) => {
    const previousItems = get().takeoffItems;
    executeCommand({
      execute: () => set({ takeoffItems: items }),
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
              prev.hidden === next.hidden
            ) {
              continue;
            }
            syncQueue.enqueue({
              kind: 'measurement.update',
              projectId,
              clientUuid: next.id,
              patch: {
                points: next.points,
                quantity: next.quantity,
                color: next.color,
                hidden: Boolean(next.hidden),
                metadata: next.metadata
                  ? {
                      createdAt: next.metadata.createdAt,
                      lastModified: next.metadata.lastModified,
                      confidence: next.metadata.confidence,
                    }
                  : null,
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
          // path never fires. Re-stage the pending value here when the
          // touched measurement is the one currently staged into the box.
          const target = get().boqTargeting;
          if (target?.pendingMeasurementId) {
            const change = quantityChanges.find(
              (c) => c.measurementId === target.pendingMeasurementId
            );
            if (change) {
              get().setBoqTargetingPending(
                Math.abs(change.quantity).toFixed(2),
                target.pendingMeasurementId
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

  setActiveTool: (tool) => set({ activeTool: tool }),

  setActiveColor: (color) => set({ activeColor: color }),

  setActiveStrokeWidth: (width) => set({ activeStrokeWidth: width }),

  setFocusedBoqCard: (card) => set({ focusedBoqCard: card }),

  startBoqTargeting: (elementId, itemId, unit, mode = 'add') => {
    set({
      boqTargeting: {
        elementId,
        itemId,
        unit,
        mode,
        pendingValue: null,
        pendingMeasurementId: null,
      },
    });
  },

  exitBoqTargeting: () => {
    set({ boqTargeting: null });
  },

  setBoqTargetingMode: (mode) => {
    set((state) =>
      state.boqTargeting
        ? { boqTargeting: { ...state.boqTargeting, mode } }
        : state
    );
  },

  setBoqTargetingPending: (value, measurementId) => {
    set((state) =>
      state.boqTargeting
        ? {
            boqTargeting: {
              ...state.boqTargeting,
              pendingValue: value,
              pendingMeasurementId: measurementId,
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

  bindMeasurementToItem: (measurementId, elementId, itemId, mode = 'add') => {
    const projectId = get().currentProjectId;
    const previousBoqElements = get().boqElements;

    set((state) => {
      let matchedMeasurement: Measurement | null = null;
      const nextItems = state.takeoffItems.map((item) => {
        const nextMeasurements = item.measurements.map((m) => {
          if (m.id !== measurementId) return m;
          matchedMeasurement = { ...m, boqElementId: elementId, boqItemId: itemId };
          return matchedMeasurement;
        });
        return nextMeasurements === item.measurements
          ? item
          : { ...item, measurements: nextMeasurements };
      });

      if (!matchedMeasurement) return state;

      // Add / update the corresponding history entry on the target item.
      const nextElements = state.boqElements.map((element) => {
        if (element.id !== elementId) return element;
        return {
          ...element,
          items: element.items.map((item) => {
            if (item.id !== itemId) return item;
            // Replace any existing linked entry for this measurement so
            // we don't duplicate on re-bind. Use the measurement's
            // quantity as the value. isDeduct comes from the current
            // Add/Deduct mode of the toolbar, not the sign of the number.
            const withoutStale = item.history.filter(
              (entry) => entry.sourceMeasurementId !== measurementId
            );
            withoutStale.push({
              id: generateClientId(),
              value: Math.abs(matchedMeasurement!.quantity).toFixed(2),
              isDeduct: mode === 'deduct',
              sourceMeasurementId: measurementId,
            });
            return { ...item, history: withoutStale };
          }),
        };
      });

      return {
        takeoffItems: nextItems,
        boqElements: nextElements,
      };
    });

    if (projectId) {
      syncQueue.enqueue({
        kind: 'measurement.update',
        projectId,
        clientUuid: measurementId,
        patch: { boq_element_id: elementId, boq_item_id: itemId },
      });
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

    const tool = state.activeTool ?? 'linear';
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
    executeCommand({
      execute: () => {
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
        // Targeting: stage the value in the input instead of committing
        // a chip directly. The user then Add/Deduct/edits to commit.
        // If a value was already pending, commit that one as a chip first
        // (binding it to its measurement), then stage the new one — so
        // drawing continuously never loses a value.
        const target = get().boqTargeting;
        if (target) {
          {
            if (target.pendingValue && target.pendingMeasurementId) {
              get().bindMeasurementToItem(
                target.pendingMeasurementId,
                target.elementId,
                target.itemId,
                target.mode
              );
            }
            get().setBoqTargetingPending(
              Math.abs(measurement.quantity).toFixed(2),
              measurement.id
            );
          }
        }
      },
      undo: () => {
        set((state) => ({
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
        }));
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
    if (!element || element.items.length <= 1) return;
    const previousElements = state.boqElements.map((el) => ({
      ...el,
      items: [...el.items],
    }));
    executeCommand({
      execute: () => {
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId
              ? { ...el, items: el.items.filter((i) => i.id !== itemId) }
              : el
          ),
        }));
        enqueueBoqOpsFromDiff(previousElements);
      },
      undo: () => {
        const before = get().boqElements;
        set({ boqElements: previousElements });
        enqueueBoqOpsFromDiff(before);
      },
      description: 'Delete item',
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
