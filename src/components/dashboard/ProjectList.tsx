import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects, useDeleteProject, useCreateProject } from "@/hooks/useProjects";
import { FiSearch, FiCopy, FiEdit2, FiTrash2 } from "react-icons/fi";
import type { Project } from "@/types/project";
import { generateClientId } from "@/utils/id";
import { saveProjectMeta } from "@/utils/projectMeta";
import { useConfirm, usePrompt } from "@/contexts/ConfirmProvider";

const ProjectList = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { data: projectsData, isLoading } = useProjects();
  const { mutate: deleteProject } = useDeleteProject();
  const { mutateAsync: createProject, isPending: isCreatingProject } = useCreateProject();
  const confirm = useConfirm();
  const prompt = usePrompt();

  const handleCreateProject = async () => {
    const title = await prompt({
      title: "New project",
      label: "Project name",
      placeholder: "e.g. 3-Bedroom Flat",
      defaultValue: "New BOQ Project",
      confirmLabel: "Create",
    });
    if (!title) return;

    const clientUuid = generateClientId();
    const created = await createProject({
      title,
      project_type: "bill_of_qty",
      location: "Lagos, Nigeria",
      client_uuid: clientUuid,
    } as Partial<Project>);

    const newProjectId = created.data?.project?.id;
    if (newProjectId) {
      saveProjectMeta(String(newProjectId), { clientUuid });
      navigate(`/project/${newProjectId}`);
    }
  };


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
                  onClick={(e) => e.stopPropagation()}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Duplicate"
                >
                  <FiCopy className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => e.stopPropagation()}
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
    </div>
  );
};

export default ProjectList;
