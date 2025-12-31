export interface Project {
  id: string;
  title: string;
  location: string;
  elements?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectStats {
  totalProjects: number;
  totalExports: number;
}

export interface ProjectsResponse {
  data: {
    projects: Project[];
    pagination: {
      total: number;
      currentPage: number;
      totalPages: number;
      limit: number;
    };
  };
}
