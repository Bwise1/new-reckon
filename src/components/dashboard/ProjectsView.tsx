import { FileStack } from 'lucide-react';
import type { Project } from '@/types/project';
import { relativeTime } from '@/utils/relativeTime';
import ProjectMenu from './ProjectMenu';

type ViewMode = 'grid' | 'list';

type Props = {
  projects: Project[];
  viewMode: ViewMode;
  emptyMessage: string;
  onOpen: (projectId: string) => void;
  onDuplicate: (projectId: string) => void;
  onRename: (project: Project) => void;
  onDelete: (project: Project) => void;
};

const elementsLabel = (n?: number) =>
  n == null ? '' : `${n} element${n === 1 ? '' : 's'}`;

/** Project cards (grid) or rows (list), as in the prototype's ProjectsView. */
export default function ProjectsView({
  projects,
  viewMode,
  emptyMessage,
  onOpen,
  onDuplicate,
  onRename,
  onDelete,
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
              <p className="mt-0.5 truncate text-xs text-muted">{project.location || 'No location'}</p>
            </div>
            <span className="hidden w-32 shrink-0 text-right text-xs text-muted sm:block">
              {elementsLabel(project.elements)}
            </span>
            <span className="hidden w-28 shrink-0 text-right text-xs text-muted lg:block">
              {relativeTime(project.updatedAt ?? project.createdAt)}
            </span>
            <ProjectMenu
              onDuplicate={() => onDuplicate(String(project.id))}
              onRename={() => onRename(project)}
              onDelete={() => onDelete(project)}
            />
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
          <div className="flex items-start justify-end">
            <ProjectMenu
              onDuplicate={() => onDuplicate(String(project.id))}
              onRename={() => onRename(project)}
              onDelete={() => onDelete(project)}
            />
          </div>
          <h3 className="mt-3 truncate text-sm font-semibold text-body">{project.title}</h3>
          <p className="mt-0.5 truncate text-xs text-muted">{project.location || 'No location'}</p>
          <p className="mt-3 text-sm font-medium tabular-nums text-body">
            {elementsLabel(project.elements) || ' '}
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {project.project_type === 'material_schedule' ? 'Material schedule' : 'Bill of quantities'}
            </span>
            <span className="shrink-0 text-xs text-muted">
              {relativeTime(project.updatedAt ?? project.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
