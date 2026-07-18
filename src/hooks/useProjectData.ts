import { useEffect, useRef } from 'react';
import { fetchAndMergeProjectPlans } from '@/services/planSync.service';
import {
  boqSync,
  calibrationSync,
  measurementSync,
} from '@/services/entitySync.service';
import { syncQueue } from '@/services/syncQueue';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import {
  boqElementsFromApiTree,
  boqTreeToUpsertOps,
  mergeApiCalibrations,
  takeoffItemsFromApiMeasurements,
} from '@/utils/entitySyncMapper';
import {
  ensureClientUuid,
  getProjectMeta,
  saveProjectMeta,
} from '@/utils/projectMeta';

/**
 * Loads a project's server-authoritative state on mount:
 *   1. Fetch plans, calibrations, measurements, BOQ tree in parallel.
 *   2. Populate the store from the server payloads.
 *   3. If the server has NO BOQ data but localStorage does, upload the
 *      local tree once (migration from the old wholesale sync). Marked
 *      with boqMigratedAt in projectMeta so it never re-runs.
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
            boqSync.list(projectId).catch((error) => {
              console.warn('[project-data] BOQ list failed', error);
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

        const serverBoqTree = boqResponse?.data?.elements ?? null;
        const meta = getProjectMeta(projectId);
        const alreadyMigrated = Boolean(meta?.boqMigratedAt);

        // One-shot migration: if the server has no BOQ AND we haven't
        // migrated this project yet AND local has data, upload the local
        // tree and use it as the seed. Skip in every other case.
        let didMigrate = false;
        const preMigrationLocalTree = useTakeoffStore.getState().boqElements;
        const shouldMigrate =
          serverBoqTree !== null &&
          serverBoqTree.length === 0 &&
          !alreadyMigrated &&
          preMigrationLocalTree.some((el) => el.items.some((it) => it.header || it.description || it.history.length > 0));

        if (shouldMigrate) {
          console.log(
            `[project-data] running one-shot BOQ migration for project=${projectId}`
          );
          for (const op of boqTreeToUpsertOps(projectId, preMigrationLocalTree)) {
            syncQueue.enqueue(op);
          }
          try {
            await syncQueue.flush(projectId);
            saveProjectMeta(projectId, {
              ...meta,
              clientUuid,
              boqMigratedAt: new Date().toISOString(),
            });
            didMigrate = true;
            console.log(
              `[project-data] BOQ migration complete for project=${projectId}`
            );
          } catch (error) {
            console.warn(
              '[project-data] BOQ migration flush failed — will retry on next open',
              error
            );
          }
        }

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

          // BOQ resolution:
          //   - If we just migrated: keep the local tree we uploaded.
          //   - Else if server returned a non-empty tree: use it.
          //   - Else: keep the local tree.
          let nextBoqElements = state.boqElements;
          if (didMigrate) {
            nextBoqElements = preMigrationLocalTree;
          } else if (serverBoqTree && serverBoqTree.length > 0) {
            nextBoqElements = boqElementsFromApiTree(serverBoqTree);
          }

          return {
            takeoffItems: nextTakeoffItems,
            planStates: nextPlanStates,
            scales: activePlanState?.scales ?? state.scales,
            calibrationLines:
              activePlanState?.calibrationLines ?? state.calibrationLines,
            boqElements: nextBoqElements,
          } as Partial<typeof state>;
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
