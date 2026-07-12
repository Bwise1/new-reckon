import {
  syncService,
  buildWebDataSyncPayload,
  CURRENT_WEB_DATA_SCHEMA_VERSION,
  type SyncProjectPayload,
} from '@/services/sync.service';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { buildBoqSyncPayload, mapPulledBoqToElements } from '@/utils/boqSyncPayload';
import { ensureClientUuid, getProjectMeta, saveProjectMeta } from '@/utils/projectMeta';
import { createEmptyBoqElement } from '@/utils/boqCalculations';
import { migrateToPlanDocuments } from '@/utils/planDocument';

const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const SYNC_DEBOUNCE_MS = 3000;
const syncDisabledProjects = new Set<string>();

const isLoggedIn = (): boolean => Boolean(localStorage.getItem('token'));
const normalizeMessage = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

const isRecoverableSyncMissing = (error: unknown): boolean => {
  const message = normalizeMessage(error);
  return (
    message.includes('project not found for client_uuid') ||
    message.includes('status code 404') ||
    message.includes('not found')
  );
};

const disableProjectSync = (projectId: string, reason: unknown): void => {
  if (syncDisabledProjects.has(projectId)) return;
  syncDisabledProjects.add(projectId);
  const timer = syncTimers[projectId];
  if (timer) {
    clearTimeout(timer);
    delete syncTimers[projectId];
  }
  console.warn(
    `Project sync disabled for ${projectId}; using local autosave only.`,
    reason
  );
};

export const isProjectSyncDisabled = (projectId: string): boolean =>
  syncDisabledProjects.has(projectId);

export const pullProjectFromServer = async (
  serverProjectId: string,
  apiClientUuid?: string | null
): Promise<void> => {
  if (!isLoggedIn()) return;
  if (isProjectSyncDisabled(serverProjectId)) return;

  const clientUuid = ensureClientUuid(serverProjectId, apiClientUuid);
  const meta = getProjectMeta(serverProjectId);

  try {
    const [boqResponse, webResponse] = await Promise.all([
      syncService.pullBoq(clientUuid, meta?.lastBoqSyncedAt),
      syncService.pullWebData(clientUuid, meta?.lastWebDataSyncedAt),
    ]);

    const boq = boqResponse.data?.boq;
    const webData = webResponse.data?.webData;

    const store = useTakeoffStore.getState();
    const updates: Parameters<typeof store.applyServerSync>[0] = {};

    if (boq && !boq.unchanged && boq.elements?.length) {
      const mapped = mapPulledBoqToElements(boq);
      if (mapped.length > 0) {
        updates.boqElements = mapped;
      }
    }

    if (webData && !webData.unchanged && webData.payload) {
      const legacyRemote =
        (webData.schema_version ?? 0) < CURRENT_WEB_DATA_SCHEMA_VERSION;

      if (legacyRemote) {
        console.warn(
          `[projectSync] Server returned legacy stage-pixel data ` +
            `(schema_version=${webData.schema_version ?? 'unknown'}) for ${serverProjectId}. ` +
            `Ignoring measurements + calibration.`
        );
      }

      const rawPlanStates = webData.payload.planStates;
      const wipedPlanStates = legacyRemote && rawPlanStates
        ? Object.fromEntries(
            Object.entries(rawPlanStates).map(([planId, state]) => [
              planId,
              { ...state, scales: {}, calibrationLines: {} },
            ])
          )
        : rawPlanStates;

      const migrated = migrateToPlanDocuments({
        backgroundImage: null,
        numPages: webData.payload.numPages ?? 0,
        currentPage: webData.payload.currentPage ?? 1,
        scales: legacyRemote ? {} : webData.payload.scales ?? {},
        calibrationLines: legacyRemote ? {} : webData.payload.calibrationLines ?? {},
        takeoffItems: legacyRemote
          ? (webData.payload.takeoffItems ?? store.takeoffItems).map((item) => ({
              ...item,
              measurements: [],
              totalQuantity: 0,
            }))
          : webData.payload.takeoffItems ?? store.takeoffItems,
        plans: webData.payload.plans,
        activePlanId: webData.payload.activePlanId,
        planStates: wipedPlanStates,
      });

      updates.takeoffItems = migrated.takeoffItems;
      updates.plans = migrated.plans;
      updates.activePlanId = migrated.activePlanId || null;
      updates.planStates = migrated.planStates;
      updates.scales = migrated.scales;
      updates.calibrationLines = migrated.calibrationLines;
      updates.currentPage = migrated.currentPage;
      updates.numPages = migrated.numPages;
    }

    if (Object.keys(updates).length > 0) {
      store.applyServerSync(updates);
    }

    saveProjectMeta(serverProjectId, {
      clientUuid,
      lastBoqSyncedAt: boq?.updated_at ?? meta?.lastBoqSyncedAt,
      lastWebDataSyncedAt: webData?.updated_at ?? meta?.lastWebDataSyncedAt,
    });
  } catch (error) {
    if (isRecoverableSyncMissing(error)) {
      disableProjectSync(serverProjectId, error);
      return;
    }
    console.warn('Project sync pull failed:', error);
  }
};

const registerProjectMetadata = async (
  clientUuid: string,
  title: string,
  location: string
): Promise<void> => {
  const payload: SyncProjectPayload = {
    client_uuid: clientUuid,
    title,
    project_type: 'bill_of_qty',
    location,
    updated_at: new Date().toISOString(),
  };
  await syncService.pushProjects([payload]);
};

export const pushProjectToServer = async (
  serverProjectId: string,
  projectInfo?: { clientUuid?: string | null; title?: string; location?: string }
): Promise<void> => {
  if (!isLoggedIn()) return;
  if (isProjectSyncDisabled(serverProjectId)) return;

  const clientUuid = ensureClientUuid(serverProjectId, projectInfo?.clientUuid);
  const state = useTakeoffStore.getState();

  if (state.currentProjectId !== serverProjectId) return;

  const now = new Date().toISOString();
  const boqPayload = buildBoqSyncPayload({
    clientUuid,
    elements:
      state.boqElements.length > 0 ? state.boqElements : [createEmptyBoqElement(0)],
    updatedAt: now,
  });

  const planStates = {
    ...state.planStates,
    ...(state.activePlanId
      ? {
            [state.activePlanId]: {
              backgroundImage: state.backgroundImage,
              numPages: state.numPages,
              currentPage: state.currentPage,
              scales: state.scales,
              calibrationLines: state.calibrationLines,
            },
        }
      : {}),
  };

  const webPayload = buildWebDataSyncPayload(clientUuid, {
    takeoffItems: state.takeoffItems,
    plans: state.plans,
    activePlanId: state.activePlanId,
    planStates,
    scales: state.scales,
    calibrationLines: state.calibrationLines,
    currentPage: state.currentPage,
    numPages: state.numPages,
  });

  try {
    await Promise.all([
      syncService.pushBoq(boqPayload),
      syncService.pushWebData(webPayload),
    ]);

    saveProjectMeta(serverProjectId, {
      clientUuid,
      lastBoqSyncedAt: now,
      lastWebDataSyncedAt: now,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('client_uuid') || message.includes('not found')) {
      try {
        await registerProjectMetadata(
          clientUuid,
          projectInfo?.title ?? 'Project',
          projectInfo?.location ?? ''
        );
        await Promise.all([
          syncService.pushBoq(boqPayload),
          syncService.pushWebData(webPayload),
        ]);
        saveProjectMeta(serverProjectId, {
          clientUuid,
          lastBoqSyncedAt: now,
          lastWebDataSyncedAt: now,
        });
        return;
      } catch (retryError) {
        if (isRecoverableSyncMissing(retryError)) {
          disableProjectSync(serverProjectId, retryError);
          return;
        }
        console.warn('Project sync push retry failed:', retryError);
        return;
      }
    }
    if (isRecoverableSyncMissing(error)) {
      disableProjectSync(serverProjectId, error);
      return;
    }
    console.warn('Project sync push failed:', error);
  }
};

export const scheduleProjectSyncPush = (serverProjectId: string): void => {
  if (!isLoggedIn()) return;
  if (isProjectSyncDisabled(serverProjectId)) return;

  const existing = syncTimers[serverProjectId];
  if (existing) {
    clearTimeout(existing);
  }

  syncTimers[serverProjectId] = setTimeout(() => {
    void pushProjectToServer(serverProjectId);
  }, SYNC_DEBOUNCE_MS);
};

export const flushProjectSyncPush = async (serverProjectId: string): Promise<void> => {
  if (isProjectSyncDisabled(serverProjectId)) return;
  const existing = syncTimers[serverProjectId];
  if (existing) {
    clearTimeout(existing);
    delete syncTimers[serverProjectId];
  }
  await pushProjectToServer(serverProjectId);
};
