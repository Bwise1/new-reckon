import { FileStack } from 'lucide-react';
import type { Project } from '@/types/project';
import { relativeTime } from '@/utils/relativeTime';
import ProjectMenu from './ProjectMenu';
import CollaboratorAvatars from './CollaboratorAvatars';
import { ROLE_LABELS } from '@/types/members';

type ViewMode = 'grid' | 'list';

type Props = {
  projects: Project[];
  viewMode: ViewMode;
  emptyMessage: string;
  onOpen: (projectId: string) => void;
  onDuplicate: (projectId: string) => void;
  onRename: (project: Project) => void;
  onDelete: (project: Project) => void;
  onShare: (project: Project) => void;
};

const elementsLabel = (n?: number) =>
  n == null ? '' : `${n} element${n === 1 ? '' : 's'}`;

const canManage = (p: Project) => p.role === 'owner' || p.role === 'project_admin';

/** Everyone to show on a card: the owner (for shared projects) plus members. */
const people = (p: Project) => [
  ...(p.owner ? [{ id: `owner-${p.id}`, name: p.owner.name, initials: p.owner.initials, avatarUrl: p.owner.avatarUrl }] : []),
  ...(p.members ?? []),
];

const menuFor = (
  project: Project,
  h: Pick<Props, 'onDuplicate' | 'onRename' | 'onDelete' | 'onShare'>
) => (
  <ProjectMenu
    canManage={canManage(project)}
    onShare={canManage(project) ? () => h.onShare(project) : undefined}
    onDuplicate={() => h.onDuplicate(String(project.id))}
    onRename={() => h.onRename(project)}
    onDelete={() => h.onDelete(project)}
  />
);

/** Project cards (grid) or rows (list), as in the prototype's ProjectsView. */
export default function ProjectsView({
  projects,
  viewMode,
  emptyMessage,
  onOpen,
  onDuplicate,
  onRename,
  onDelete,
  onShare,
}: Props) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-overlay/15 py-16 text-center">
        <FileStack className="h-6 w-6 text-muted" strokeWidth={1.5} />
        <p className="text-sm text-muted">{emptyMessage}</p>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {projects.map((project, index) => (
          <div
            key={project.id}
            onClick={() => onOpen(String(project.id))}
            className={`group flex cursor-pointer items-center gap-4 bg-surface px-4 py-3 transition-colors hover:bg-overlay/5 ${
              index === projects.length - 1 ? '' : 'border-b border-border'
            }`}
          >
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-body">{project.title}</h3>
              <p className="mt-0.5 truncate text-xs text-muted">
                {project.client ? `${project.client} · ` : ''}
                {project.location || 'No location'}
              </p>
            </div>
            <span className="hidden w-32 shrink-0 text-right text-xs text-muted sm:block">
              {elementsLabel(project.elements)}
            </span>
            <span className="hidden w-28 shrink-0 text-right text-xs text-muted lg:block">
              {relativeTime(project.updatedAt ?? project.createdAt)}
            </span>
            <div className="hidden shrink-0 md:block">
              <CollaboratorAvatars people={people(project)} />
            </div>
            {menuFor(project, { onDuplicate, onRename, onDelete, onShare })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <div
          key={project.id}
          onClick={() => onOpen(String(project.id))}
          className="group flex cursor-pointer flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-overlay/20 hover:shadow-sm"
        >
          <div className="flex items-start justify-between">
            {project.role && project.role !== 'owner' ? (
              <span className="rounded-md bg-overlay/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {ROLE_LABELS[project.role]}
              </span>
            ) : (
              <span />
            )}
            {menuFor(project, { onDuplicate, onRename, onDelete, onShare })}
          </div>
          <h3 className="mt-3 truncate text-sm font-semibold text-body">{project.title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {project.client ? `${project.client} · ` : ''}
            {project.location || 'No location'}
            {project.owner && <> · {project.owner.name}</>}
          </p>
          <p className="mt-3 text-sm font-medium tabular-nums text-body">
            {elementsLabel(project.elements) || ' '}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            {people(project).length > 0 ? (
              <CollaboratorAvatars people={people(project)} />
            ) : (
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {project.project_type === 'material_schedule' ? 'Material schedule' : 'Bill of quantities'}
              </span>
            )}
            <span className="shrink-0 text-xs text-muted">
              {relativeTime(project.updatedAt ?? project.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
