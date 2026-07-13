import { useEffect, useRef } from 'react';
import { fetchAndMergeProjectPlans } from '@/services/planSync.service';
import {
  calibrationSync,
  measurementSync,
} from '@/services/entitySync.service';
import { syncQueue } from '@/services/syncQueue';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import {
  mergeApiCalibrations,
  takeoffItemsFromApiMeasurements,
} from '@/utils/entitySyncMapper';
import { syncService } from '@/services/sync.service';
import { mapPulledBoqToElements } from '@/utils/boqSyncPayload';
import { ensureClientUuid } from '@/utils/projectMeta';

/**
 * Loads a project's server-authoritative state on mount:
 *   1. Fetch plans, calibrations, measurements in parallel.
 *   2. Fetch BOQ elements (unchanged path).
 *   3. Populate the store.
 *   4. Resume the persisted sync queue for this project.
 *
 * Replaces `useProjectSync`. No wholesale JSON-blob push/pull.
 */
export const useProjectData = (
  projectId: string | undefined,
  projectInfo?: { clientUuid?: string | null; title?: string; location?: string }
) => {
  const loadedRef = useRef<string | null>(null);
  const isLoggedIn = Boolean(localStorage.getItem('token'));

  useEffect(() => {
    if (!projectId) return;
    if (!isLoggedIn) return;

    // Local baseline: always load persisted store first so the canvas has
    // something to render before the network responses arrive.
    if (loadedRef.current !== projectId) {
      loadedRef.current = projectId;
      useTakeoffStore.getState().loadProject(projectId);
    }

    const apiClientUuid = projectInfo?.clientUuid ?? null;

    void (async () => {
      // Skip until the API confirms this project has a real client_uuid.
      // The effect re-runs when React Query resolves the project.
      const clientUuid = ensureClientUuid(projectId, apiClientUuid);
      if (!clientUuid) {
        console.log(
          `[project-data] waiting for API client_uuid project=${projectId}`
        );
        return;
      }

      try {
        const [boqResponse, plansPromise, calibrationsResponse, measurementsResponse] =
          await Promise.all([
            syncService.pullBoq(clientUuid).catch((error) => {
              console.warn('[project-data] BOQ pull failed', error);
              return null;
            }),
            fetchAndMergeProjectPlans(projectId).catch((error) => {
              console.warn('[project-data] plans fetch failed', error);
              return null;
            }),
            calibrationSync.list(projectId).catch((error) => {
              console.warn('[project-data] calibrations list failed', error);
              return null;
            }),
            measurementSync.list(projectId).catch((error) => {
              console.warn('[project-data] measurements list failed', error);
              return null;
            }),
          ]);

        // Plans are already merged into the store by fetchAndMergeProjectPlans.
        void plansPromise;

        useTakeoffStore.setState((state) => {
          const nextPlanStates = calibrationsResponse
            ? mergeApiCalibrations(
                state.planStates,
                calibrationsResponse.data?.calibrations ?? []
              )
            : state.planStates;
          const nextTakeoffItems = measurementsResponse
            ? takeoffItemsFromApiMeasurements(
                measurementsResponse.data?.measurements ?? []
              )
            : state.takeoffItems;

          // Rehydrate flat scales/calibrationLines from the active plan's state.
          const activePlanState = state.activePlanId
            ? nextPlanStates[state.activePlanId]
            : undefined;

          return {
            takeoffItems: nextTakeoffItems,
            planStates: nextPlanStates,
            scales: activePlanState?.scales ?? state.scales,
            calibrationLines:
              activePlanState?.calibrationLines ?? state.calibrationLines,
            ...(boqResponse && !boqResponse.data?.boq?.unchanged
              ? {
                  boqElements: mapPulledBoqToElements(boqResponse.data.boq),
                }
              : {}),
          };
        });

        console.log(`[project-data] hydrated project=${projectId}`);
      } catch (error) {
        console.warn('[project-data] hydration failed', error);
      }

      // Resume draining any ops queued from previous sessions.
      syncQueue.resume(projectId);
    })();

    return () => {
      if (projectId) void syncQueue.flush(projectId);
    };
  }, [projectId, projectInfo?.clientUuid, isLoggedIn]);
};
