import { apiClient } from '@/lib/api-client';
import type { ProjectsResponse, ProjectStats, Project } from '@/types/project';

export const projectService = {
  getProjects: () => {
    return apiClient.get<ProjectsResponse>('/projects');
  },

  getProject: (id: string) => {
    return apiClient.get<{ data: Project }>(`/projects/${id}`);
  },

  createProject: (data: Partial<Project>) => {
    return apiClient.post<{ data: Project }>('/projects', data);
  },

  updateProject: (id: string, data: Partial<Project>) => {
    return apiClient.put<{ data: Project }>(`/projects/${id}`, data);
  },

  deleteProject: (id: string) => {
    return apiClient.delete(`/projects/${id}`);
  },

  getStats: () => {
    return apiClient.get<{ data: ProjectStats }>('/projects/stats');
  },
};
