import type { PlanDiscipline, ProjectPlan } from '@/types/takeoff';
import type { ProjectPlan as ApiProjectPlan } from '@/services/plan.service';

const VALID_DISCIPLINES: readonly PlanDiscipline[] = [
  'architectural',
  'structural',
  'mep',
  'civil',
  'other',
];

const coerceDiscipline = (value: unknown): PlanDiscipline | undefined =>
  typeof value === 'string' && (VALID_DISCIPLINES as readonly string[]).includes(value)
    ? (value as PlanDiscipline)
    : undefined;

export const mapApiPlanToClient = (api: ApiProjectPlan): ProjectPlan => {
  const name =
    api.filename?.replace(/\.[^.]+$/, '')?.trim() || api.filename || 'Plan';

  return {
    id: api.client_uuid,
    name,
    filename: api.filename,
    url: api.url,
    mimeType: api.mime_type ?? undefined,
    pageCount: api.page_count ?? 1,
    sortOrder: api.sort_order ?? 0,
    discipline: coerceDiscipline(api.discipline),
  };
};

export const mergePlanLists = (
  localPlans: ProjectPlan[],
  remotePlans: ProjectPlan[],
  deletedIds: readonly string[] = []
): ProjectPlan[] => {
  const normalize = (value?: string): string =>
    (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\.[^.]+$/, '');

  const deleted = new Set(deletedIds);
  // Remote plans that were tombstoned client-side are dropped — this prevents
  // the "just-deleted plan reappears after sync pull" bug when the server
  // DELETE hasn't propagated yet.
  const effectiveRemote = remotePlans.filter(
    (plan) => plan.id && !deleted.has(plan.id)
  );

  const byId = new Map<string, ProjectPlan>();

  for (const plan of localPlans) {
    if (!plan.id) continue;
    if (deleted.has(plan.id)) continue;
    byId.set(plan.id, plan);
  }

  for (const remote of effectiveRemote) {
    if (!remote.id) continue;
    const existing = byId.get(remote.id);
    if (existing) {
      byId.set(remote.id, {
        ...existing,
        name: remote.name || existing.name,
        filename: remote.filename ?? existing.filename,
        url: remote.url ?? existing.url,
        mimeType: remote.mimeType ?? existing.mimeType,
        pageCount: remote.pageCount || existing.pageCount,
        sortOrder: remote.sortOrder,
        discipline: remote.discipline ?? existing.discipline,
      });
    } else {
      byId.set(remote.id, remote);
    }
  }

  // Reconcile legacy local plans whose ids differ from server client_uuid.
  // Match by filename/name to copy remote URL + mime metadata into the local-id entry.
  for (const remote of effectiveRemote) {
    const remoteKey = normalize(remote.filename || remote.name);
    if (!remoteKey) continue;

    for (const [id, local] of byId.entries()) {
      if (id === remote.id) continue;
      if (local.url) continue;

      const localKey = normalize(local.filename || local.name);
      if (!localKey || localKey !== remoteKey) continue;

      byId.set(id, {
        ...local,
        filename: remote.filename ?? local.filename,
        url: remote.url ?? local.url,
        mimeType: remote.mimeType ?? local.mimeType,
        pageCount: remote.pageCount || local.pageCount,
        sortOrder: local.sortOrder ?? remote.sortOrder,
        discipline: local.discipline ?? remote.discipline,
      });
      break;
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder);
};
