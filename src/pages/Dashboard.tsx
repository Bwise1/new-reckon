import { useState } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import StatsCards from "@/components/dashboard/StatsCards";
import ProjectList from "@/components/dashboard/ProjectList";
import NewProjectModal from "@/components/dashboard/NewProjectModal";
import { useProjects, useCreateProject } from "@/hooks/useProjects";
import { useProfile } from "@/hooks/useProfile";
import { generateClientId } from "@/utils/id";
import { saveProjectMeta } from "@/utils/projectMeta";
import { useNavigate } from "react-router-dom";
import type { Project } from "@/types/project";

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("files");
  const [showNewProject, setShowNewProject] = useState(false);
  const { data: projectsData } = useProjects();
  const { data: profileData } = useProfile();
  const { mutateAsync: createProject, isPending: isCreatingProject } = useCreateProject();

  const projectCount = projectsData?.data?.projects?.length ?? 0;
  const profile = profileData?.data?.user;
  const firstName = profile?.firstName ?? profile?.email?.split("@")[0] ?? "there";

  const handleCreate = async ({ title, location }: { title: string; location: string; file?: File }) => {
    const clientUuid = generateClientId();
    const created = await createProject({
      title,
      project_type: "bill_of_qty",
      location: location || "Lagos, Nigeria",
      client_uuid: clientUuid,
    } as Partial<Project>);

    const newProjectId = created.data?.project?.id;
    if (newProjectId) {
      saveProjectMeta(String(newProjectId), { clientUuid });
      setShowNewProject(false);
      navigate(`/project/${newProjectId}`);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col" style={{ paddingLeft: "calc(50% - 185px)" }}>
        <div className="mb-10">
          <StatsCards projectCount={projectCount} />
        </div>

        <div style={{ width: "370px" }}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Welcome {firstName}</h2>
            <button
              onClick={() => setShowNewProject(true)}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
            >
              New Project
            </button>
          </div>

          <div className="flex border-b border-gray-200 mb-4">
            <button
              onClick={() => setActiveTab("files")}
              className={`flex-1 pb-3 text-sm text-center transition-colors ${
                activeTab === "files"
                  ? "text-gray-900 font-medium border-b-2 border-gray-900 -mb-px"
                  : "text-gray-400"
              }`}
            >
              My Files
            </button>
            <button
              onClick={() => setActiveTab("community")}
              className={`flex-1 pb-3 text-sm text-center transition-colors ${
                activeTab === "community"
                  ? "text-gray-900 font-medium border-b-2 border-gray-900 -mb-px"
                  : "text-gray-400"
              }`}
            >
              Community
            </button>
          </div>

          <div className="pb-16 min-h-screen">
            {activeTab === "files" && <ProjectList />}
            {activeTab === "community" && (
              <div className="text-center text-gray-400 py-12 text-sm">
                Community projects coming soon
              </div>
            )}
          </div>
        </div>
      </div>

      <NewProjectModal
        isOpen={showNewProject}
        isPending={isCreatingProject}
        onClose={() => setShowNewProject(false)}
        onCreate={handleCreate}
      />
    </DashboardLayout>
  );
};

export default Dashboard;
