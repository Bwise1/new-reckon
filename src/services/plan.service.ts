import { apiClient } from '@/lib/api-client';
import { generateClientId } from '@/utils/id';

export interface ProjectPlan {
  id: number;
  project_id: number;
  client_uuid: string;
  filename: string;
  url: string;
  public_id: string;
  mime_type: string | null;
  page_count: number;
  sort_order: number;
  discipline?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const planService = {
  listPlans: (projectId: string) =>
    apiClient.get<{ data: { plans: ProjectPlan[] } }>(`/projects/${projectId}/plans`),

  uploadPlan: (
    projectId: string,
    file: File,
    pageCount = 1,
    clientUuid?: string,
    sortOrder = 0,
    discipline?: string | null
  ) => {
    const formData = new FormData();
    formData.append('projectPlan', file);
    formData.append('client_uuid', clientUuid ?? generateClientId());
    formData.append('page_count', String(pageCount));
    formData.append('sort_order', String(sortOrder));
    if (discipline) formData.append('discipline', discipline);
    return apiClient.postForm<{ data: { plan: ProjectPlan } }>(
      `/projects/${projectId}/plans`,
      formData
    );
  },

  updatePlanDiscipline: (
    projectId: string,
    planClientUuid: string,
    discipline: string | null
  ) =>
    apiClient.patch<{ data: { plan: ProjectPlan } }>(
      `/projects/${projectId}/plans/${planClientUuid}`,
      { discipline }
    ),

  deletePlan: async (projectId: string, planClientUuid: string) => {
    try {
      return await apiClient.delete<{ data?: unknown }>(
        `/projects/${projectId}/plans/${planClientUuid}`
      );
    } catch (error) {
      // 404 = already gone on server; treat as success so the client-side
      // wipe still runs. Any other error bubbles up so callers can surface it.
      const status =
        typeof error === 'object' && error !== null && 'response' in error
          ? (error as { response?: { status?: number } }).response?.status
          : undefined;
      if (status === 404) return { data: undefined };
      throw error;
    }
  },
};
