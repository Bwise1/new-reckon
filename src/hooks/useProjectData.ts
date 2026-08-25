import { useEffect, useRef, useState } from 'react';
import { fetchAndMergeProjectPlans } from '@/services/planSync.service';
import {
  boqSync,
  calibrationSync,
  measurementSync,
} from '@/services/entitySync.service';
import { syncQueue } from '@/services/syncQueue';
import { generateClientId } from '@/utils/id';
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
  projectInfo?: {
    clientUuid?: string | null;
    title?: string;
    location?: string;
    /** When true, the project fetch itself failed (404/403/etc). Skip all
     * hydration and mark ready so the caller can render an error UI. */
    skip?: boolean;
  }
) => {
  const loadedRef = useRef<string | null>(null);
  // Guards against a slow hydration for a previously-selected project landing
  // on the global store after the user has already switched to another one.
  const loadGenerationRef = useRef(0);
  const isLoggedIn = Boolean(localStorage.getItem('token'));
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!projectId || !isLoggedIn || projectInfo?.skip) {
      setIsReady(true);
      return;
    }
    setIsReady(false);

    const generation = ++loadGenerationRef.current;
    const isStale = () => loadGenerationRef.current !== generation;

    // Local baseline: always load persisted store first so the canvas has
    // something to render before the network responses arrive.
    if (loadedRef.current !== projectId) {
      loadedRef.current = projectId;
      useTakeoffStore.getState().loadProject(projectId);
    }

    const apiClientUuid = projectInfo?.clientUuid ?? null;

    void (async () => {
      try {
        // Skip until the API confirms this project has a real client_uuid.
        // The effect re-runs when React Query resolves the project.
        const clientUuid = ensureClientUuid(projectId, apiClientUuid);
        if (!clientUuid) {
          console.log(
            `[project-data] waiting for API client_uuid project=${projectId}`
          );
          return;
        }

        // Flush anything queued from a previous session BEFORE reading the
        // server. Hydration replaces takeoffItems wholesale, so fetching first
        // meant work created offline was absent from the response and vanished
        // from the UI until another reload.
        if (syncQueue.size(projectId) > 0) {
          try {
            await syncQueue.flush(projectId);
          } catch (error) {
            console.warn(
              '[project-data] pre-hydration flush failed — keeping local state',
              error
            );
          }
        }

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

        // Another project was selected while these were in flight; its own
        // effect owns the store now.
        if (isStale()) {
          console.log(
            `[project-data] discarding stale hydration for project=${projectId}`
          );
          return;
        }

        // Plans are already merged into the store by fetchAndMergeProjectPlans.
        void plansPromise;

        const serverBoqTree = boqResponse?.data?.elements ?? null;
        const serverBills = boqResponse?.data?.bills ?? [];
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
          const localBillId = useTakeoffStore.getState().activeBillId ?? undefined;
          for (const op of boqTreeToUpsertOps(projectId, preMigrationLocalTree, localBillId)) {
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
          // Only trust the server list when nothing is still queued. If the
          // pre-hydration flush could not complete (offline, auth expired),
          // the response cannot contain those ops and replacing state here
          // would discard them.
          const hasPendingOps = syncQueue.size(projectId) > 0;
          const nextTakeoffItems =
            measurementsResponse && !hasPendingOps
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
          //   - Else if server returned a non-empty tree: use it, grouped by
          //     bill (elements with no bill belong to the first bill).
          //   - Else: keep the local tree.
          let nextBoqElements = state.boqElements;
          let billsPatch: Partial<typeof state> = {};
          if (didMigrate) {
            nextBoqElements = preMigrationLocalTree;
          } else if (serverBoqTree && serverBoqTree.length > 0) {
            const allElements = boqElementsFromApiTree(serverBoqTree);
            if (serverBills.length > 0) {
              // Server knows bills: its grouping is the source of truth.
              const billForElement = new Map(
                serverBoqTree.map((el) => [el.client_uuid, el.bill_client_uuid ?? null])
              );
              const bills = serverBills.map((b) => ({ id: b.client_uuid, name: b.name }));
              const firstBillId = bills[0].id;
              const grouped: Record<string, typeof allElements> = {};
              for (const el of allElements) {
                const billId = billForElement.get(el.id) ?? firstBillId;
                const target = bills.some((b) => b.id === billId) ? billId : firstBillId;
                (grouped[target] = grouped[target] ?? []).push(el);
              }
              const activeBillId =
                state.activeBillId && bills.some((b) => b.id === state.activeBillId)
                  ? state.activeBillId
                  : firstBillId;
              nextBoqElements = grouped[activeBillId] ?? [];
              const stash = { ...grouped };
              delete stash[activeBillId];
              billsPatch = {
                bills,
                activeBillId,
                billElements: stash,
              } as Partial<typeof state>;
            } else if (state.bills.length > 1) {
              // The server doesn't know bills yet (route not deployed, or a
              // pre-bills backend) but LOCAL has a multi-bill structure.
              // Local is authoritative — replacing it with a fresh default
              // bill here is exactly the clobber that crossed bill
              // identities. Keep local trees; re-register the bills so the
              // server learns them once it can.
              nextBoqElements = state.boqElements;
              state.bills.forEach((bill, idx) => {
                syncQueue.enqueue({
                  kind: 'boq.bill.upsert',
                  projectId,
                  clientUuid: bill.id,
                  body: { name: bill.name, sort_order: idx },
                });
              });
            } else {
              // Single (or no) local bill: adopt the server tree into it.
              const billId = state.activeBillId ?? generateClientId();
              const billName = state.bills[0]?.name ?? 'Bill No. 1';
              nextBoqElements = allElements;
              billsPatch = {
                bills: [{ id: billId, name: billName }],
                activeBillId: billId,
                billElements: {},
              } as Partial<typeof state>;
              syncQueue.enqueue({
                kind: 'boq.bill.upsert',
                projectId,
                clientUuid: billId,
                body: { name: billName, sort_order: 0 },
              });
            }
          }

          return {
            takeoffItems: nextTakeoffItems,
            planStates: nextPlanStates,
            scales: activePlanState?.scales ?? state.scales,
            calibrationLines:
              activePlanState?.calibrationLines ?? state.calibrationLines,
            boqElements:
              nextBoqElements.length > 0
                ? nextBoqElements
                : state.boqElements,
            ...billsPatch,
          } as Partial<typeof state>;
        });

        console.log(`[project-data] hydrated project=${projectId}`);

        // Resume draining any ops queued from previous sessions.
        syncQueue.resume(projectId);
      } catch (error) {
        console.warn('[project-data] hydration failed', error);
      } finally {
        // A superseded run must not flip the loading gate for the project the
        // user actually has open.
        if (!isStale()) setIsReady(true);
      }
    })();

    return () => {
      if (projectId) void syncQueue.flush(projectId);
    };
  }, [projectId, projectInfo?.clientUuid, projectInfo?.skip, isLoggedIn]);

  return { isReady };
};
