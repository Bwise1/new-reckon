import { apiClient } from '@/lib/api-client';
import type { ProjectsResponse, ProjectStats, Project } from '@/types/project';
import { normalizeProject } from '@/utils/projectMapper';

type ApiListResponse = {
  status: string;
  message: string;
  data: ProjectsResponse['data'];
};

type ApiProjectResponse = {
  status: string;
  message: string;
  data: { project: ApiProjectRow };
};

type ApiProjectRow = Parameters<typeof normalizeProject>[0];

export const projectService = {
  getProjects: async () => {
    const response = await apiClient.get<ApiListResponse>('/projects');
    const projects = (response.data?.projects ?? []).map(normalizeProject);
    return {
      ...response,
      data: {
        ...response.data,
        projects,
      },
    };
  },

  getProject: async (id: string) => {
    const response = await apiClient.get<ApiProjectResponse>(`/projects/${id}`);
    const project = normalizeProject(response.data.project);
    return {
      ...response,
      data: { project },
    };
  },

  createProject: (data: Partial<Project>) => {
    return apiClient.post<{ data: { project: Project } }>('/projects', data);
  },

  updateProject: (id: string, data: Partial<Project>) => {
    return apiClient.put<{ data: { project: Project } }>(`/projects/${id}`, data);
  },

  deleteProject: (id: string) => {
    return apiClient.delete(`/projects/${id}`);
  },

  getStats: () => {
    return apiClient.get<{ data: ProjectStats }>('/projects/stats');
  },
};
