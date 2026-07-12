const META_PREFIX = 'reckon_project_meta_';

export interface ProjectMeta {
  clientUuid: string;
  lastBoqSyncedAt?: string;
  lastWebDataSyncedAt?: string;
}

export const getProjectMeta = (serverProjectId: string): ProjectMeta | null => {
  try {
    const raw = localStorage.getItem(`${META_PREFIX}${serverProjectId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectMeta;
  } catch {
    return null;
  }
};

export const saveProjectMeta = (serverProjectId: string, meta: ProjectMeta): void => {
  localStorage.setItem(`${META_PREFIX}${serverProjectId}`, JSON.stringify(meta));
};

export const ensureClientUuid = (
  serverProjectId: string,
  apiClientUuid?: string | null
): string => {
  if (apiClientUuid) {
    const existing = getProjectMeta(serverProjectId);
    saveProjectMeta(serverProjectId, {
      ...existing,
      clientUuid: apiClientUuid,
    });
    return apiClientUuid;
  }

  const existing = getProjectMeta(serverProjectId);
  if (existing?.clientUuid) {
    return existing.clientUuid;
  }

  const clientUuid = `legacy-${serverProjectId}`;
  saveProjectMeta(serverProjectId, { clientUuid });
  return clientUuid;
};
