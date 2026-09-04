import { create } from 'zustand';
import type { ProjectCapabilities, ProjectRole } from '@/types/members';

/**
 * What the signed-in person may do on the open project (docs/sharing-plan.md).
 * Filled from GET /boq's `access` at hydration; until then — and for the
 * owner — everything is allowed, so nothing flickers into read-only.
 */
interface ProjectAccessState {
  role: ProjectRole;
  can: ProjectCapabilities;
  set: (access: { role: ProjectRole; can: ProjectCapabilities }) => void;
  reset: () => void;
}

const ALL: ProjectCapabilities = { edit: true, seeCosts: true, manage: true, comment: true };

export const useProjectAccessStore = create<ProjectAccessState>((set) => ({
  role: 'owner',
  can: ALL,
  set: (access) => set({ role: access.role, can: { ...ALL, ...access.can } }),
  reset: () => set({ role: 'owner', can: ALL }),
}));

/** Non-hook read for stores/services. */
export const projectCan = () => useProjectAccessStore.getState().can;
