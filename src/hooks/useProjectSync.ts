import { useEffect, useRef } from 'react';
import { pullProjectFromServer, flushProjectSyncPush } from '@/services/projectSync.service';
import { fetchAndMergeProjectPlans } from '@/services/planSync.service';
import { useTakeoffStore } from '@/store/useTakeoffStore';

/**
 * Pulls cloud BOQ + canvas state when a project opens; flushes pending pushes on leave.
 */
export const useProjectSync = (
  projectId: string | undefined,
  projectInfo?: { clientUuid?: string | null; title?: string; location?: string }
) => {
  const loadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    // Only load from localStorage once per project — re-runs from clientUuid resolving
    // should only do the server pull, not wipe and reload local state again.
    if (loadedRef.current !== projectId) {
      loadedRef.current = projectId;
      useTakeoffStore.getState().loadProject(projectId);
    }

    void (async () => {
      await pullProjectFromServer(projectId, projectInfo?.clientUuid);
      await fetchAndMergeProjectPlans(projectId);
    })();

    return () => {
      void flushProjectSyncPush(projectId);
    };
  }, [projectId, projectInfo?.clientUuid, projectInfo?.title, projectInfo?.location]);
};
