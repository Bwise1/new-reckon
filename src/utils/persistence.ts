import type { TakeoffItem, CalibrationLine, EstimationCardData } from '@/types/takeoff';

export interface PersistedProjectData {
  takeoffItems: TakeoffItem[];
  scales: Record<number, number>;
  calibrationLines: Record<number, CalibrationLine>;
  currentPage: number;
  numPages: number;
  backgroundImage: string | null;
  estimationCards: EstimationCardData[];
  lastSaved: string;
}

const STORAGE_PREFIX = 'reckon_project_';
const AUTO_SAVE_DEBOUNCE = 500; // ms

let saveTimeout: NodeJS.Timeout | null = null;

/**
 * Save project data to localStorage
 */
export const saveProjectToStorage = (projectId: string, data: Omit<PersistedProjectData, 'lastSaved'>): void => {
  try {
    const persistedData: PersistedProjectData = {
      ...data,
      lastSaved: new Date().toISOString(),
    };

    const key = `${STORAGE_PREFIX}${projectId}`;
    localStorage.setItem(key, JSON.stringify(persistedData));

    // Also update the project list metadata
    updateProjectMetadata(projectId, {
      lastModified: persistedData.lastSaved,
      itemCount: data.takeoffItems.length,
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

    return JSON.parse(data) as PersistedProjectData;
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

    // Also remove from project metadata
    removeProjectMetadata(projectId);
  } catch (error) {
    console.error('Failed to delete project from localStorage:', error);
  }
};

/**
 * Auto-save with debouncing
 */
export const autoSaveProject = (projectId: string, data: Omit<PersistedProjectData, 'lastSaved'>): void => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveProjectToStorage(projectId, data);
    console.log('Auto-saved project:', projectId);
  }, AUTO_SAVE_DEBOUNCE);
};

/**
 * Project metadata for listing
 */
interface ProjectMetadata {
  id: string;
  lastModified: string;
  itemCount: number;
}

const METADATA_KEY = 'reckon_projects_metadata';

/**
 * Get all project metadata
 */
export const getProjectsMetadata = (): ProjectMetadata[] => {
  try {
    const data = localStorage.getItem(METADATA_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load projects metadata:', error);
    return [];
  }
};

/**
 * Update project metadata
 */
const updateProjectMetadata = (projectId: string, updates: Partial<ProjectMetadata>): void => {
  try {
    const metadata = getProjectsMetadata();
    const index = metadata.findIndex(p => p.id === projectId);

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

/**
 * Remove project metadata
 */
const removeProjectMetadata = (projectId: string): void => {
  try {
    const metadata = getProjectsMetadata();
    const filtered = metadata.filter(p => p.id !== projectId);
    localStorage.setItem(METADATA_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove project metadata:', error);
  }
};

/**
 * Clear all project data (useful for debugging)
 */
export const clearAllProjects = (): void => {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
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
