import DashboardLayout from "@/layouts/DashboardLayout";
import StatsCards from "@/components/dashboard/StatsCards";
import ProjectList from "@/components/dashboard/ProjectList";

const Dashboard = () => {
  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brandColor mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here's an overview of your projects.</p>
      </div>

      <div className="mb-8">
        <StatsCards />
      </div>

      <div className="pb-64 min-h-screen">
        <ProjectList />
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
