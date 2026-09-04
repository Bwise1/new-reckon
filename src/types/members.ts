/** Project sharing (docs/sharing-plan.md). */

export type ProjectRole = 'owner' | 'project_admin' | 'editor' | 'contributor' | 'reviewer' | 'viewer';
export type AssignableRole = Exclude<ProjectRole, 'owner'>;

export const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Owner',
  project_admin: 'Project Admin',
  editor: 'Editor',
  contributor: 'Contributor',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};

/** What each role can do — the order used in pickers, most powerful first. */
export const ASSIGNABLE_ROLES: { value: AssignableRole; label: string; hint: string }[] = [
  { value: 'project_admin', label: 'Project Admin', hint: 'Everything, including people and deleting the project' },
  { value: 'editor', label: 'Editor', hint: 'Takeoff and BOQ, sees rates and amounts' },
  { value: 'contributor', label: 'Contributor', hint: 'Measures and edits quantities — never sees rates' },
  { value: 'reviewer', label: 'Reviewer', hint: 'Reads and comments, sees rates, cannot edit' },
  { value: 'viewer', label: 'Viewer', hint: 'Read-only, no rates' },
];

export interface ProjectCapabilities {
  edit: boolean;
  seeCosts: boolean;
  manage: boolean;
  comment: boolean;
}

export interface ProjectPerson {
  id: number;
  name: string;
  initials: string;
  avatarUrl: string | null;
  email: string;
  role: ProjectRole;
  since?: string;
}

export interface ProjectInvite {
  id: string;
  email: string;
  role: AssignableRole;
  expiresAt: string;
  createdAt: string;
  invitedBy: string;
}

export interface InvitePreview {
  projectTitle: string;
  inviter: string;
  role: AssignableRole;
  email: string;
  state: 'open' | 'accepted' | 'expired';
}
