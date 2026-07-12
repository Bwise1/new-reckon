export interface Project {
  id: string;
  client_uuid?: string;
  title: string;
  location: string;
  project_type?: 'bill_of_qty' | 'material_schedule';
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
