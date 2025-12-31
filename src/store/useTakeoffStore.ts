import { create } from 'zustand';
import type { TakeoffItem, TakeoffMode, Measurement, CalibrationLine, EstimationCardData } from '@/types/takeoff';
import { loadProjectFromStorage, autoSaveProject } from '@/utils/persistence';

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

  // Reset
  reset: () => void;
}

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
};

export const useTakeoffStore = create<TakeoffStore>((set, get) => ({
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
    set({ takeoffItems: items });
    get().triggerAutoSave();
  },

  addTakeoffItem: (item) => {
    set((state) => ({
      takeoffItems: [...state.takeoffItems, item],
      activeItemId: item.id,
    }));
    get().triggerAutoSave();
  },

  updateTakeoffItem: (id, updates) => {
    set((state) => ({
      takeoffItems: state.takeoffItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
    get().triggerAutoSave();
  },

  deleteTakeoffItem: (id) => {
    set((state) => ({
      takeoffItems: state.takeoffItems.filter((item) => item.id !== id),
      activeItemId: state.activeItemId === id ? null : state.activeItemId,
    }));
    get().triggerAutoSave();
  },

  setActiveItemId: (id) => set({ activeItemId: id }),

  addMeasurement: (itemId, measurement) => {
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
    get().triggerAutoSave();
  },

  removeMeasurement: (itemId, measurementId) => {
    set((state) => ({
      takeoffItems: state.takeoffItems.map((item) => {
        if (item.id === itemId) {
          const measurement = item.measurements.find((m) => m.id === measurementId);
          return {
            ...item,
            measurements: item.measurements.filter((m) => m.id !== measurementId),
            totalQuantity: item.totalQuantity - (measurement?.quantity || 0),
          };
        }
        return item;
      }),
    }));
    get().triggerAutoSave();
  },

  setScale: (page, scale) => {
    set((state) => ({
      scales: { ...state.scales, [page]: scale },
    }));
    get().triggerAutoSave();
  },

  setCalibrationLine: (page, line) => {
    set((state) => ({
      calibrationLines: { ...state.calibrationLines, [page]: line },
    }));
    get().triggerAutoSave();
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
    set((state) => ({
      estimationCards: [...state.estimationCards, card],
    }));
    get().triggerAutoSave();
  },

  updateEstimationCard: (id, updates) => {
    set((state) => ({
      estimationCards: state.estimationCards.map((card) =>
        card.id === id ? { ...card, ...updates } : card
      ),
    }));
    get().triggerAutoSave();
  },

  deleteEstimationCard: (id) => {
    set((state) => ({
      estimationCards: state.estimationCards.filter((card) => card.id !== id),
    }));
    get().triggerAutoSave();
  },

  reset: () => set(initialState),
}));
