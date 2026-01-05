import { create } from 'zustand';
import type { TakeoffItem, TakeoffMode, Measurement, CalibrationLine, EstimationCardData } from '@/types/takeoff';
import { loadProjectFromStorage, autoSaveProject } from '@/utils/persistence';

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

  // Estimation cards
  estimationCards: EstimationCardData[];

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
  setActiveItemId: (id: string | null) => void;

  addMeasurement: (itemId: string, measurement: Measurement) => void;
  removeMeasurement: (itemId: string, measurementId: string) => void;

  setScale: (page: number, scale: number) => void;
  setCalibrationLine: (page: number, line: CalibrationLine) => void;
  setCalibrationMode: (mode: boolean) => void;

  setCurrentPage: (page: number) => void;
  setNumPages: (pages: number) => void;
  setBackgroundImage: (image: string | null) => void;

  // Estimation cards
  addEstimationCard: (card: EstimationCardData) => void;
  updateEstimationCard: (id: string, updates: Partial<EstimationCardData>) => void;
  deleteEstimationCard: (id: string) => void;

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
  estimationCards: [],
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
          estimationCards: savedData.estimationCards || [],
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
        estimationCards: state.estimationCards,
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

  addEstimationCard: (card) => {
    executeCommand({
      execute: () => {
        set((state) => ({
          estimationCards: [...state.estimationCards, card],
        }));
      },
      undo: () => {
        set((state) => ({
          estimationCards: state.estimationCards.filter((c) => c.id !== card.id),
        }));
      },
      description: `Add estimation card: ${card.header}`,
    });
  },

  updateEstimationCard: (id, updates) => {
    const state = get();
    const card = state.estimationCards.find((c) => c.id === id);
    if (!card) return;

    const previousCard = { ...card };
    executeCommand({
      execute: () => {
        set((state) => ({
          estimationCards: state.estimationCards.map((card) =>
            card.id === id ? { ...card, ...updates } : card
          ),
        }));
      },
      undo: () => {
        set((state) => ({
          estimationCards: state.estimationCards.map((card) =>
            card.id === id ? previousCard : card
          ),
        }));
      },
      description: `Update estimation card: ${card.header}`,
    });
  },

  deleteEstimationCard: (id) => {
    const state = get();
    const card = state.estimationCards.find((c) => c.id === id);
    if (!card) return;

    const previousCards = [...state.estimationCards];
    executeCommand({
      execute: () => {
        set((state) => ({
          estimationCards: state.estimationCards.filter((card) => card.id !== id),
        }));
      },
      undo: () => {
        set({ estimationCards: previousCards });
      },
      description: `Delete estimation card: ${card.header}`,
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
