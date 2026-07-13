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

  // Calibration
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  calibrationMode: boolean;

  // Canvas state (active plan view)
  currentPage: number;
  numPages: number;
  backgroundImage: string | null;
  plans: ProjectPlan[];
  activePlanId: string | null;
  planStates: Record<string, PlanDocumentState>;
  /** Client-side tombstones: ids of plans the user deleted. Suppressed
   * from every server merge path so the plan doesn't get resurrected
   * on the next pull if the server DELETE hasn't propagated yet. */
  deletedPlanIds: string[];

  boqElements: BoqElementData[];
  pricing: BoqPricing;

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
  ensureCanvasItemId: () => string;

  addMeasurement: (itemId: string, measurement: Measurement) => void;
  removeMeasurement: (itemId: string, measurementId: string) => void;
  toggleMeasurementHidden: (itemId: string, measurementId: string) => void;

  setScale: (page: number, scale: number) => void;
  setCalibrationLine: (page: number, line: CalibrationLine) => void;
  setCalibrationMode: (mode: boolean) => void;

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
    },
  };
};

const initialState = {
  currentProjectId: null,
  takeoffItems: [],
  activeItemId: null,
  activeTool: null,
  activeColor: MARKUP_COLORS[0],
  scales: {},
  calibrationLines: {},
  calibrationMode: false,
  currentPage: 1,
  numPages: 0,
  backgroundImage: null,
  plans: [],
  activePlanId: null,
  planStates: {},
  deletedPlanIds: [],
  boqElements: [createEmptyBoqElement(0)],
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
        }));
        const projectId = get().currentProjectId;
        if (projectId) {
          syncQueue.enqueue({
            kind: 'measurement.delete',
            projectId,
            clientUuid: measurementId,
          });
        }
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
      execute: () => set({ boqElements: [...state.boqElements, newElement] }),
      undo: () => set({ boqElements: previousElements }),
      description: `Add ${newElement.title}`,
    });
  },

  updateBoqElement: (elementId, updates) => {
    const state = get();
    const element = state.boqElements.find((e) => e.id === elementId);
    if (!element) return;
    const previousElement = { ...element, items: [...element.items] };
    executeCommand({
      execute: () =>
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId ? { ...el, ...updates } : el
          ),
        })),
      undo: () =>
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId ? previousElement : el
          ),
        })),
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
      execute: () =>
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId ? { ...el, items: [...el.items, newItem] } : el
          ),
        })),
      undo: () => set({ boqElements: previousElements }),
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
    executeCommand({
      execute: () =>
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId
              ? {
                  ...el,
                  items: el.items.map((i) =>
                    i.id === itemId ? { ...i, ...updates } : i
                  ),
                }
              : el
          ),
        })),
      undo: () => set({ boqElements: previousElements }),
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
      execute: () =>
        set((current) => ({
          boqElements: current.boqElements.map((el) =>
            el.id === elementId
              ? { ...el, items: el.items.filter((i) => i.id !== itemId) }
              : el
          ),
        })),
      undo: () => set({ boqElements: previousElements }),
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
      execute: () =>
        set((current) => ({
          boqElements: current.boqElements.map((el) => {
            if (el.id !== elementId) return el;
            const items = [...el.items];
            items.splice(sourceIndex + 1, 0, copy);
            return { ...el, items };
          }),
        })),
      undo: () => set({ boqElements: previousElements }),
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
