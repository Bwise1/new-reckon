import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Folder, LogOut, Settings } from 'lucide-react';
import Logo from '@/assets/images/logo_blue.svg';
import { useProfile } from '@/hooks/useProfile';
import { useLogout } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/auth.store';
import { initials } from '@/lib/avatar';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import ThemeToggle from '@/components/ThemeToggle';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Projects', icon: Folder },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

/** The prototype's dashboard sidebar: brand, workspace switcher, nav, profile. */
export default function DashboardSidebar() {
  const { pathname } = useLocation();
  const { data: profileResponse } = useProfile();
  const authUser = useAuthStore((s) => s.user);
  const { mutate: logout, isPending: loggingOut } = useLogout();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const profile = profileResponse?.data?.user;
  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
    authUser?.name ||
    profile?.email?.split('@')[0] ||
    '';
  const email = profile?.email ?? authUser?.email ?? '';

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-ink px-3 py-4">
      <div className="flex items-center gap-2 px-1 pb-4">
        <img src={Logo} alt="" className="h-6 w-6 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-body">Reckon Bill</span>
        <ThemeToggle />
      </div>

      <WorkspaceSwitcher ownerName={name} />

      <nav className="mt-5 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-overlay/10 text-body' : 'text-muted hover:bg-overlay/5 hover:text-body'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsProfileOpen((o) => !o)}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors cursor-pointer ${
            isProfileOpen ? 'bg-overlay/10' : 'hover:bg-overlay/5'
          }`}
        >
          {profile?.profilePicture ? (
            <img src={profile.profilePicture} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-overlay/10 text-xs font-semibold text-body">
              {name ? initials(name) : '?'}
            </span>
          )}
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm font-medium text-body">{name || 'Account'}</span>
            <span className="block truncate text-xs text-muted">{email}</span>
          </span>
        </button>

        {isProfileOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsProfileOpen(false)} />
            <div className="absolute bottom-full left-0 z-20 mb-2 w-full min-w-[200px] rounded-lg border border-border bg-surface py-1 shadow-lg">
              <Link
                to="/settings"
                onClick={() => setIsProfileOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5"
              >
                <Settings className="h-4 w-4 text-muted" />
                Account Settings
              </Link>
              <div className="mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => {
                  setIsProfileOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-50 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
