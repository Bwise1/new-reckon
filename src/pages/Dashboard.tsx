import { useState } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import StatsCards from "@/components/dashboard/StatsCards";
import ProjectList from "@/components/dashboard/ProjectList";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("files");

  return (
    <DashboardLayout>
      <div className="flex flex-col" style={{ paddingLeft: "calc(50% - 185px)" }}>
        <div className="mb-10">
          <StatsCards />
        </div>

        <div style={{ width: "370px" }}>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Welcome Emmanuel</h2>
            <button className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors">
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
    </DashboardLayout>
  );
};

export default Dashboard;
