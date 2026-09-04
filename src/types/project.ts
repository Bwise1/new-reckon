import type { ProjectPerson, ProjectRole } from './members';

export interface Project {
  id: string;
  client_uuid?: string;
  title: string;
  location: string;
  /** The client/company the project is prepared for (optional). */
  client?: string | null;
  project_type?: 'bill_of_qty' | 'material_schedule';
  elements?: number;
  createdAt?: string;
  updatedAt?: string;
  /** My role on it — 'owner' for my own projects (docs/sharing-plan.md). */
  role?: ProjectRole;
  /** The owner, for projects shared with me. */
  owner?: Omit<ProjectPerson, 'role' | 'since'>;
  /** People on the project besides the owner. */
  members?: ProjectPerson[];
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
