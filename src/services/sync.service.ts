import { apiClient } from '@/lib/api-client';
import type { Project } from '@/types/project';
import type { BoqSyncPayload } from '@/utils/boqSyncPayload';
import type { TakeoffItem, CalibrationLine, ProjectPlan } from '@/types/takeoff';
import type { PlanDocumentState } from '@/utils/planDocument';

export interface SyncProjectPayload {
  client_uuid: string;
  title: string;
  project_type: 'bill_of_qty' | 'material_schedule';
  location?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

// Schema history:
//   4: original web-data schema
//   6: measurement points + calibration in image-pixel space (viewport-independent).
//      Prior versions stored data in stage-pixel space and cannot be migrated.
export const CURRENT_WEB_DATA_SCHEMA_VERSION = 6;

export interface WebDataSyncPayload {
  client_uuid: string;
  schema_version: number;
  updated_at: string;
  payload: {
    takeoffItems: TakeoffItem[];
    plans: ProjectPlan[];
    activePlanId: string | null;
    planStates: Record<string, PlanDocumentState>;
    scales: Record<number, number>;
    calibrationLines: Record<number, CalibrationLine>;
    currentPage: number;
    numPages: number;
  };
}

export const syncService = {
  pushProjects: (projects: SyncProjectPayload[]) =>
    apiClient.post<{ data: { projects: Project[] } }>('/projects/sync/push', { projects }),

  pullProjects: (since?: string) =>
    apiClient.get<{ data: { projects: Project[] } }>(
      since ? `/projects/sync/pull?since=${encodeURIComponent(since)}` : '/projects/sync/pull'
    ),

  pushBoq: (payload: BoqSyncPayload) =>
    apiClient.post<{ data: { boq: BoqSyncPayload } }>('/projects/sync/boq/push', payload),

  pullBoq: (clientUuid: string, since?: string) =>
    apiClient.get<{ data: { boq: BoqSyncPayload & { unchanged?: boolean } } }>(
      since
        ? `/projects/sync/boq/pull?client_uuid=${encodeURIComponent(clientUuid)}&since=${encodeURIComponent(since)}`
        : `/projects/sync/boq/pull?client_uuid=${encodeURIComponent(clientUuid)}`
    ),

  pushWebData: (payload: WebDataSyncPayload) =>
    apiClient.post<{ data: { webData: unknown } }>('/projects/sync/web-data/push', payload),

  pullWebData: (clientUuid: string, since?: string) =>
    apiClient.get<{
      data: {
        webData: {
          payload?: WebDataSyncPayload['payload'];
          schema_version?: number;
          updated_at?: string;
          unchanged?: boolean;
        } | null;
      };
    }>(
      since
        ? `/projects/sync/web-data/pull?client_uuid=${encodeURIComponent(clientUuid)}&since=${encodeURIComponent(since)}`
        : `/projects/sync/web-data/pull?client_uuid=${encodeURIComponent(clientUuid)}`
    ),
};

export const buildWebDataSyncPayload = (
  clientUuid: string,
  state: {
    takeoffItems: TakeoffItem[];
    plans: ProjectPlan[];
    activePlanId: string | null;
    planStates: Record<string, PlanDocumentState>;
    scales: Record<number, number>;
    calibrationLines: Record<number, CalibrationLine>;
    currentPage: number;
    numPages: number;
  },
  schemaVersion = CURRENT_WEB_DATA_SCHEMA_VERSION
): WebDataSyncPayload => ({
  client_uuid: clientUuid,
  schema_version: schemaVersion,
  updated_at: new Date().toISOString(),
  payload: {
    takeoffItems: state.takeoffItems,
    plans: state.plans,
    activePlanId: state.activePlanId,
    planStates: state.planStates,
    scales: state.scales,
    calibrationLines: state.calibrationLines,
    currentPage: state.currentPage,
    numPages: state.numPages,
  },
});
