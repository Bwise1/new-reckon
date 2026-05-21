import { apiClient } from "@/lib/api-client";
import type { Project } from "@/types/project";

export interface SyncProjectPayload {
  client_uuid: string;
  title: string;
  project_type: "bill_of_qty" | "material_schedule";
  location?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export const syncService = {
  pushProjects: (projects: SyncProjectPayload[]) =>
    apiClient.post<{ data: { projects: Project[] } }>("/projects/sync/push", { projects }),

  pullProjects: (since?: string) =>
    apiClient.get<{ data: { projects: Project[] } }>(
      since ? `/projects/sync/pull?since=${encodeURIComponent(since)}` : "/projects/sync/pull"
    ),
};
