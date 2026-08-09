import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useProjects,
  useDeleteProject,
  useDuplicateProject,
  useUpdateProject,
} from "@/hooks/useProjects";
import { FiSearch, FiCopy, FiEdit2, FiTrash2 } from "react-icons/fi";
import { useConfirm } from "@/contexts/ConfirmProvider";
import NewProjectModal from "@/components/dashboard/NewProjectModal";
import type { Project } from "@/types/project";

const ProjectList = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const { data: projectsData, isLoading } = useProjects();
  const { mutate: deleteProject } = useDeleteProject();
  const { mutate: duplicateProject, isPending: isDuplicating } = useDuplicateProject();
  const { mutate: updateProject, isPending: isUpdating } = useUpdateProject();
  const confirm = useConfirm();
  const prompt = usePrompt();


  const projects = projectsData?.data?.projects || [];

  const filteredProjects = projects.filter((project) =>
    project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    const project = projects.find((p) => String(p.id) === id);
    const ok = await confirm({
      title: "Delete project?",
      message: (
        <>
          <p>
            <span className="font-medium text-gray-900">
              {project?.title ?? "This project"}
            </span>{" "}
            will be removed permanently.
          </p>
          <p className="mt-1 text-xs text-gray-500">This cannot be undone.</p>
        </>
      ),
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    deleteProject(id);
  };

  const handleDuplicate = (id: string) => {
    if (isDuplicating) return;
    duplicateProject({ id });
  };

  const handleEdit = (id: string) => {
    const project = projects.find((p) => String(p.id) === id);
    if (project) setEditingProject(project);
  };

  const handleEditSave = ({ title, location }: { title: string; location: string }) => {
    if (!editingProject) return;
    updateProject({
      id: String(editingProject.id),
      data: { title: title.trim(), location: location.trim() },
    });
    setEditingProject(null);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-gray-200 rounded w-full"></div>
          <div className="h-16 bg-gray-200 rounded w-full"></div>
          <div className="h-16 bg-gray-200 rounded w-full"></div>
          <div className="h-16 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 mb-3">
        <FiSearch className="text-gray-400 w-4 h-4 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search Projects"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 text-sm text-gray-600 placeholder-gray-400 focus:outline-none bg-transparent"
        />
      </div>

      <div className="space-y-2">
        {filteredProjects.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            <p className="text-sm">{searchQuery ? "No projects found matching your search" : "No projects yet. Create your first project!"}</p>
          </div>
        ) : (
          filteredProjects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => navigate(`/project/${project.id}`)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{project.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-semibold text-gray-700">Location:</span> {project.location || "Unknown"}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDuplicate(project.id.toString());
                  }}
                  disabled={isDuplicating}
                  className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                  title="Duplicate"
                >
                  <FiCopy className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(project.id.toString());
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Edit"
                >
                  <FiEdit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(project.id.toString());
                  }}
                  className="text-red-400 hover:text-red-600 transition-colors"
                  title="Delete"
                >
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <NewProjectModal
        mode="edit"
        isOpen={editingProject !== null}
        isPending={isUpdating}
        initialTitle={editingProject?.title ?? ""}
        initialLocation={editingProject?.location ?? ""}
        onClose={() => setEditingProject(null)}
        onCreate={handleEditSave}
      />
    </div>
  );
};

export default ProjectList;
