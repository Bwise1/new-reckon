import type { ReactNode } from 'react';
import DashboardSidebar from '@/components/dashboard/DashboardSidebar';

/** Sidebar + scrolling main, as in the prototype's (dashboard) layout. */
const DashboardLayout = ({ children }: { children: ReactNode }) => (
  <div className="flex h-screen overflow-hidden bg-canvas">
    <DashboardSidebar />
    <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
  </div>
);

export default DashboardLayout;
