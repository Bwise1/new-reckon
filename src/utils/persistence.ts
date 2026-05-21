import type {
  TakeoffItem,
  CalibrationLine,
  EstimationCardData,
  BoqElementData,
  BoqPricing,
} from '@/types/takeoff';
import { generateClientId } from '@/utils/id';
import { createEmptyBoqItem, elementTitleFromIndex } from '@/utils/boqCalculations';

export interface PersistedProjectData {
  schemaVersion: number;
  takeoffItems: TakeoffItem[];
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  currentPage: number;
  numPages: number;
  backgroundImage: string | null;
  boqElements: BoqElementData[];
  pricing: BoqPricing;
  lastSaved: string;
}

const STORAGE_PREFIX = 'reckon_project_';
const AUTO_SAVE_DEBOUNCE = 500; // ms
const CURRENT_SCHEMA_VERSION = 3;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

type LegacyBoqElement = BoqElementData & { header?: string };

const normalizeBoqElements = (elements: LegacyBoqElement[]): BoqElementData[] =>
  elements.map((element) => {
    const legacyHeader = element.header?.trim() ?? '';
    const items = element.items.map((item, index) => ({
      ...item,
      header: item.header?.trim() || (index === 0 ? legacyHeader : '') || '',
    }));
    return { id: element.id, title: element.title, items };
  });

const migrateLegacyCardsToElements = (
  cards: Array<EstimationCardData & { header?: string }>,
  legacyBoqElement?: { title?: string; header?: string }
): BoqElementData[] => {
  if (cards.length === 0) {
    return [
      {
        id: generateClientId(),
        title: legacyBoqElement?.title ?? elementTitleFromIndex(0),
        items: [createEmptyBoqItem()],
      },
    ];
  }

  const fallbackHeader = legacyBoqElement?.header?.trim() ?? '';

  return [
    {
      id: generateClientId(),
      title: legacyBoqElement?.title ?? elementTitleFromIndex(0),
      items: cards.map((card) => ({
        ...card,
        header: card.header?.trim() ?? '',
      })),
    },
  ].map((element) => {
    if (!fallbackHeader || element.items[0]?.header) return element;
    return {
      ...element,
      items: element.items.map((item, index) =>
        index === 0 ? { ...item, header: fallbackHeader } : item
      ),
    };
  });
};

/**
 * Save project data to localStorage
 */
export const saveProjectToStorage = (
  projectId: string,
  data: Omit<PersistedProjectData, 'lastSaved' | 'schemaVersion'>
): void => {
  try {
    const persistedData: PersistedProjectData = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ...data,
      lastSaved: new Date().toISOString(),
    };

    const key = `${STORAGE_PREFIX}${projectId}`;
    localStorage.setItem(key, JSON.stringify(persistedData));

    updateProjectMetadata(projectId, {
      lastModified: persistedData.lastSaved,
      itemCount: data.takeoffItems.length,
      elementCount: data.boqElements.length,
    });
  } catch (error) {
    console.error('Failed to save project to localStorage:', error);
  }
};

/**
 * Load project data from localStorage
 */
export const loadProjectFromStorage = (projectId: string): PersistedProjectData | null => {
  try {
    const key = `${STORAGE_PREFIX}${projectId}`;
    const data = localStorage.getItem(key);

    if (!data) {
      return null;
    }

    const parsed = JSON.parse(data) as Partial<PersistedProjectData> & {
      estimationCards?: Array<EstimationCardData & { header?: string }>;
      boqElement?: { title?: string; header?: string };
    };
    const schemaVersion = parsed.schemaVersion ?? 1;

    const boqElements = normalizeBoqElements(
      (parsed.boqElements && parsed.boqElements.length > 0
        ? parsed.boqElements
        : migrateLegacyCardsToElements(
            parsed.estimationCards || [],
            parsed.boqElement
          )) as LegacyBoqElement[]
    );

    const pricing = parsed.pricing ?? { vatRate: 0, contingency: 0 };

    if (schemaVersion < 2) {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        takeoffItems: parsed.takeoffItems || [],
        scales: parsed.scales || {},
        calibrationLines: parsed.calibrationLines || {},
        currentPage: parsed.currentPage || 1,
        numPages: parsed.numPages || 0,
        backgroundImage: parsed.backgroundImage || null,
        boqElements,
        pricing,
        lastSaved: parsed.lastSaved || new Date().toISOString(),
      };
    }

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      takeoffItems: parsed.takeoffItems || [],
      scales: parsed.scales || {},
      calibrationLines: parsed.calibrationLines || {},
      currentPage: parsed.currentPage || 1,
      numPages: parsed.numPages || 0,
      backgroundImage: parsed.backgroundImage || null,
      boqElements,
      pricing,
      lastSaved: parsed.lastSaved || new Date().toISOString(),
    };
  } catch (error) {
    console.error('Failed to load project from localStorage:', error);
    return null;
  }
};

/**
 * Delete project data from localStorage
 */
export const deleteProjectFromStorage = (projectId: string): void => {
  try {
    const key = `${STORAGE_PREFIX}${projectId}`;
    localStorage.removeItem(key);
    removeProjectMetadata(projectId);
  } catch (error) {
    console.error('Failed to delete project from localStorage:', error);
  }
};

/**
 * Auto-save with debouncing
 */
export const autoSaveProject = (
  projectId: string,
  data: Omit<PersistedProjectData, 'lastSaved' | 'schemaVersion'>
): void => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveProjectToStorage(projectId, data);
    console.log('Auto-saved project:', projectId);
  }, AUTO_SAVE_DEBOUNCE);
};

interface ProjectMetadata {
  id: string;
  lastModified: string;
  itemCount: number;
  elementCount?: number;
}

/**
 * BOQ element count from local autosave.
 * Returns null when this project has no local data (use API count instead).
 */
export const getLocalBoqElementCount = (projectId: string): number | null => {
  const data = loadProjectFromStorage(projectId);
  if (!data) return null;
  return data.boqElements.length;
};

const METADATA_KEY = 'reckon_projects_metadata';

export const getProjectsMetadata = (): ProjectMetadata[] => {
  try {
    const data = localStorage.getItem(METADATA_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load projects metadata:', error);
    return [];
  }
};

const updateProjectMetadata = (projectId: string, updates: Partial<ProjectMetadata>): void => {
  try {
    const metadata = getProjectsMetadata();
    const index = metadata.findIndex((p) => p.id === projectId);

    if (index >= 0) {
      metadata[index] = { ...metadata[index], ...updates };
    } else {
      metadata.push({
        id: projectId,
        lastModified: updates.lastModified || new Date().toISOString(),
        itemCount: updates.itemCount || 0,
      });
    }

    localStorage.setItem(METADATA_KEY, JSON.stringify(metadata));
  } catch (error) {
    console.error('Failed to update project metadata:', error);
  }
};

const removeProjectMetadata = (projectId: string): void => {
  try {
    const metadata = getProjectsMetadata();
    const filtered = metadata.filter((p) => p.id !== projectId);
    localStorage.setItem(METADATA_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove project metadata:', error);
  }
};

export const clearAllProjects = (): void => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
    localStorage.removeItem(METADATA_KEY);
    console.log('Cleared all project data');
  } catch (error) {
    console.error('Failed to clear project data:', error);
  }
};
