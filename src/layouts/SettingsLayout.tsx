import type { ReactNode } from 'react';
import DashboardLayout from './DashboardLayout';
import SettingsNav from '@/components/settings/SettingsNav';

/**
 * Settings shell: the dashboard chrome plus a tab rail, hosting the workspace-
 * and account-scoped settings pages. Ported from the prototype's settings
 * layout, adapted to React Router.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-6">
          <h1 className="text-lg font-semibold text-body">Settings</h1>
          <p className="mt-0.5 text-sm text-muted">
            Manage branding, billing, security, and team access.
          </p>
        </header>

        <div className="flex flex-col gap-8 md:flex-row">
          <SettingsNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </DashboardLayout>
  );
}
