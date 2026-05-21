import { create } from 'zustand';
import type {
  TakeoffItem,
  Measurement,
  CalibrationLine,
  EstimationCardData,
  BoqElementData,
  BoqPricing,
} from '@/types/takeoff';
import { createEmptyBoqElement, createEmptyBoqItem } from '@/utils/boqCalculations';
import { loadProjectFromStorage, autoSaveProject } from '@/utils/persistence';
import { generateClientId } from '@/utils/id';

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

  // Calibration
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  calibrationMode: boolean;

  // Canvas state
  currentPage: number;
  numPages: number;
  backgroundImage: string | null;

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

  // Actions
  setTakeoffItems: (items: TakeoffItem[]) => void;
  addTakeoffItem: (item: TakeoffItem) => void;
  updateTakeoffItem: (id: string, updates: Partial<TakeoffItem>) => void;
  deleteTakeoffItem: (id: string) => void;
  duplicateTakeoffItem: (id: string) => void;
  moveTakeoffItemUp: (id: string) => void;
  moveTakeoffItemDown: (id: string) => void;
  setActiveItemId: (id: string | null) => void;

  addMeasurement: (itemId: string, measurement: Measurement) => void;
  removeMeasurement: (itemId: string, measurementId: string) => void;

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

const initialState = {
  currentProjectId: null,
  takeoffItems: [],
  activeItemId: null,
  scales: {},
  calibrationLines: {},
  calibrationMode: false,
  currentPage: 1,
  numPages: 0,
  backgroundImage: null,
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
        set({
          currentProjectId: projectId,
          takeoffItems: savedData.takeoffItems,
          scales: savedData.scales,
          calibrationLines: savedData.calibrationLines,
          currentPage: savedData.currentPage,
          numPages: savedData.numPages,
          backgroundImage: savedData.backgroundImage,
          boqElements:
            savedData.boqElements?.length > 0
              ? savedData.boqElements
              : [createEmptyBoqElement(0)],
          pricing: savedData.pricing || { vatRate: 0, contingency: 0 },
          undoStack: [],
          redoStack: [],
          canUndo: false,
          canRedo: false,
        });
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
      autoSaveProject(state.currentProjectId, {
        takeoffItems: state.takeoffItems,
        scales: state.scales,
        calibrationLines: state.calibrationLines,
        currentPage: state.currentPage,
        numPages: state.numPages,
        backgroundImage: state.backgroundImage,
        boqElements: state.boqElements,
        pricing: state.pricing,
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
      },
      description: 'Remove measurement',
    });
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
      },
      description: `Set calibration line for page ${page}`,
    });
  },

  setCalibrationMode: (mode) => set({ calibrationMode: mode }),

  setCurrentPage: (page) => {
    set({ currentPage: page });
    get().triggerAutoSave();
  },

  setNumPages: (pages) => {
    set({ numPages: pages });
    get().triggerAutoSave();
  },

  setBackgroundImage: (image) => {
    set({ backgroundImage: image });
    get().triggerAutoSave();
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
