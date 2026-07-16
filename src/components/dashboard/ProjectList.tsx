import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjects, useDeleteProject, useCreateProject } from "@/hooks/useProjects";
import { FiSearch, FiMoreVertical, FiEdit2, FiTrash2, FiEye } from "react-icons/fi";
import type { Project } from "@/types/project";
import { formatProjectCreatedAt } from "@/utils/projectMapper";
import { generateClientId } from "@/utils/id";
import { saveProjectMeta } from "@/utils/projectMeta";
import { useConfirm, usePrompt } from "@/contexts/ConfirmProvider";

const ProjectList = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
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
    setOpenMenuId(null);
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
      <div className="mb-6">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search Projects"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary focus:border-transparent bg-white"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm">

      <div className="space-y-3 p-6">
        {filteredProjects.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <p>{searchQuery ? "No projects found matching your search" : "No projects yet. Create your first project!"}</p>
          </div>
        ) : (
          filteredProjects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group"
              onClick={() => navigate(`/project/${project.id}`)}
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">{project.title}</p>
                <p className="text-sm text-gray-500">Created by {project.location || "Unknown"}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuPosition({
                    top: rect.bottom + 4,
                    right: window.innerWidth - rect.right
                  });
                  setOpenMenuId(openMenuId === project.id ? null : project.id);
                }}
                className="p-2 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Actions"
              >
                <FiMoreVertical className="text-gray-600 w-5 h-5" />
              </button>
            </div>
          ))
        )}
      </div>

      </div>

      {openMenuId && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setOpenMenuId(null)}
          />
          <div
            className="fixed w-48 bg-white rounded-lg shadow-2xl border border-gray-200 py-2 z-[101]"
            style={{
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`
            }}
          >
            <button
              onClick={() => {
                navigate(`/project/${openMenuId}`);
                setOpenMenuId(null);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-3 transition-colors"
            >
              <FiEye className="text-blue-600" />
              <span className="font-medium">View Project</span>
            </button>
            <button
              onClick={() => setOpenMenuId(null)}
              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors"
            >
              <FiEdit2 className="text-gray-500" />
              <span>Edit</span>
            </button>
            <div className="border-t border-gray-100 my-1"></div>
            <button
              onClick={() => {
                handleDelete(openMenuId);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
            >
              <FiTrash2 />
              <span>Delete</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ProjectList;
