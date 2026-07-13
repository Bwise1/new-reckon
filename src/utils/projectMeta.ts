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

/**
 * Returns the sync client_uuid for a project. Prefers the API-provided value
 * (which is authoritative and gets cached), falls back to whatever was
 * previously cached from an earlier API call. Returns null when neither is
 * available — callers must no-op in that case rather than fabricating a
 * fallback uuid. A fabricated uuid used to cause different browsers to
 * collide on the same "legacy-{id}" and blow away each other's server state
 * on race conditions; we no longer manufacture uuids client-side at all.
 */
export const ensureClientUuid = (
  serverProjectId: string,
  apiClientUuid?: string | null
): string | null => {
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

  return null;
};
