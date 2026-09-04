import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/layouts/DashboardLayout';
import ProjectsToolbar, {
  type ProjectTab,
  type SortOption,
  type ViewMode,
} from '@/components/dashboard/ProjectsToolbar';
import ProjectsView from '@/components/dashboard/ProjectsView';
import NewProjectModal from '@/components/dashboard/NewProjectModal';
import CollaborateModal from '@/components/dashboard/CollaborateModal';
import {
  useProjects,
  useCreateProject,
  useDeleteProject,
  useDuplicateProject,
  useUpdateProject,
} from '@/hooks/useProjects';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { generateClientId } from '@/utils/id';
import { saveProjectMeta } from '@/utils/projectMeta';
import type { Project } from '@/types/project';

const VIEW_KEY = 'reckon_projects_view';

/**
 * The projects dashboard, laid out like the prototype: workspace header,
 * toolbar (search, sort, grid/list, New Project, tabs), then cards or rows.
 * "Shared with Me" is empty until project sharing ships.
 */
const Dashboard = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: projectsData, isLoading } = useProjects();
  const { mutateAsync: createProject, isPending: isCreating } = useCreateProject();
  const { mutate: updateProject, isPending: isUpdating } = useUpdateProject();
  const { mutate: duplicateProject } = useDuplicateProject();
  const { mutate: deleteProject } = useDeleteProject();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('lastModified');
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as ViewMode) || 'grid';
    } catch {
      return 'grid';
    }
  });
  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };
  const [activeTab, setActiveTab] = useState<ProjectTab>('all');
  const [showNewProject, setShowNewProject] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [sharing, setSharing] = useState<Project | null>(null);

  const projects = useMemo(() => projectsData?.data?.projects ?? [], [projectsData]);

  const visible = useMemo(() => {
    let result =
      activeTab === 'shared'
        ? projects.filter((p) => p.role && p.role !== 'owner')
        : activeTab === 'mine'
          ? projects.filter((p) => !p.role || p.role === 'owner')
          : projects;
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) => p.title.toLowerCase().includes(q) || (p.location ?? '').toLowerCase().includes(q)
      );
    }
    result = [...result];
    if (sortBy === 'name') result.sort((a, b) => a.title.localeCompare(b.title));
    else
      result.sort(
        (a, b) =>
          new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
          new Date(a.updatedAt ?? a.createdAt ?? 0).getTime()
      );
    return result;
  }, [projects, activeTab, search, sortBy]);

  const handleCreate = async ({ title, location }: { title: string; location: string }) => {
    const clientUuid = generateClientId();
    try {
      const created = await createProject({
        title,
        project_type: 'bill_of_qty',
        location: location || 'Lagos, Nigeria',
        client_uuid: clientUuid,
      } as Partial<Project>);
      setShowNewProject(false);
      const id = created.data?.project?.id;
      if (id) {
        saveProjectMeta(String(id), { clientUuid });
        navigate(`/project/${id}`);
      }
    } catch {
      // Leave the dialog open so the user can retry.
    }
  };

  const handleRename = ({ title, location }: { title: string; location: string }) => {
    if (!editing) return;
    updateProject({ id: String(editing.id), data: { title, location } });
    setEditing(null);
  };

  const handleDelete = async (project: Project) => {
    const ok = await confirm({
      title: 'Delete project?',
      message: (
        <>
          <p>
            <span className="font-medium text-body">{project.title}</span> will be removed permanently.
          </p>
          <p className="mt-1 text-xs text-muted">This cannot be undone.</p>
        </>
      ),
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteProject(String(project.id));
  };

  const emptyMessage =
    activeTab === 'shared'
      ? 'Nothing shared with you yet.'
      : search
        ? 'No projects match your search.'
        : 'No projects yet. Create your first project.';

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-surface px-6 py-5">
          <h1 className="text-lg font-semibold text-body">Personal Workspace</h1>
          <p className="mt-0.5 text-sm text-muted">
            {projects.filter((p) => !p.role || p.role === 'owner').length} active project
            {projects.filter((p) => !p.role || p.role === 'owner').length === 1 ? '' : 's'}
          </p>
        </div>

        <ProjectsToolbar
          search={search}
          onSearchChange={setSearch}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onNewProject={() => setShowNewProject(true)}
          canCreateProject
        />

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-xl border border-border bg-surface" />
              ))}
            </div>
          ) : (
            <ProjectsView
              projects={visible}
              viewMode={viewMode}
              emptyMessage={emptyMessage}
              onOpen={(id) => navigate(`/project/${id}`)}
              onDuplicate={(id) => duplicateProject({ id })}
              onRename={(project) => setEditing(project)}
              onDelete={handleDelete}
              onShare={(project) => setSharing(project)}
            />
          )}
        </div>
      </div>

      <NewProjectModal
        isOpen={showNewProject}
        isPending={isCreating}
        onClose={() => setShowNewProject(false)}
        onCreate={handleCreate}
      />
      {sharing && (
        <CollaborateModal
          projectId={String(sharing.id)}
          projectTitle={sharing.title}
          open
          onClose={() => setSharing(null)}
        />
      )}
      <NewProjectModal
        mode="edit"
        isOpen={editing !== null}
        isPending={isUpdating}
        initialTitle={editing?.title ?? ''}
        initialLocation={editing?.location ?? ''}
        onClose={() => setEditing(null)}
        onCreate={handleRename}
      />
    </DashboardLayout>
  );
};

export default Dashboard;
