import type { ReactNode } from "react";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <div className="min-h-screen bg-white">
      <DashboardHeader />
      <main className="px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
