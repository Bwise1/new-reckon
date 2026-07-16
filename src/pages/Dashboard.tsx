import { useState } from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import StatsCards from "@/components/dashboard/StatsCards";
import ProjectList from "@/components/dashboard/ProjectList";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("files");

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center w-full px-6">
        <div className="mb-12">
          <StatsCards />
        </div>

        <div className="w-full" style={{ maxWidth: "470px" }}>
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Welcome Emmanuel</h2>
              <button className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded hover:bg-gray-800 transition-colors">
                New Project
              </button>
            </div>
          </div>

          <div className="mb-6 flex gap-12 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("files")}
              className={`pb-3 font-medium text-sm transition-colors ${
                activeTab === "files"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-400 hover:text-gray-700"
              }`}
            >
              My Files
            </button>
            <button
              onClick={() => setActiveTab("community")}
              className={`pb-3 font-medium text-sm transition-colors ${
                activeTab === "community"
                  ? "text-gray-900 border-b-2 border-gray-900"
                  : "text-gray-400 hover:text-gray-700"
              }`}
            >
              Community
            </button>
          </div>

          <div className="pb-64 min-h-screen">
            {activeTab === "files" && <ProjectList />}
            {activeTab === "community" && (
              <div className="text-center text-gray-500 py-12">
                <p>Community projects coming soon</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
