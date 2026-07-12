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
    sortOrder = 0
  ) => {
    const formData = new FormData();
    formData.append('projectPlan', file);
    formData.append('client_uuid', clientUuid ?? generateClientId());
    formData.append('page_count', String(pageCount));
    formData.append('sort_order', String(sortOrder));
    return apiClient.postForm<{ data: { plan: ProjectPlan } }>(
      `/projects/${projectId}/plans`,
      formData
    );
  },
};
