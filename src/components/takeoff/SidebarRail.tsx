import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Globe, Settings, User, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useLogout } from '@/hooks/useAuth';

/**
 * The 64px navigation rail on the far left of the project shell (Reckon-Bill
 * prototype): logo back to projects, Project/Community/Settings, and the
 * profile popover at the bottom. Lives inside the dark-themed shell.
 */
const SidebarRail: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { mutate: logout } = useLogout();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const close = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [profileOpen]);

  const railItem =
    'flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 transition-colors cursor-pointer';

  return (
    <aside className="w-16 shrink-0 h-full flex flex-col items-center border-r border-border bg-ink py-4">
      <button
        type="button"
        aria-label="Back to projects"
        title="Back to projects"
        onClick={() => navigate('/dashboard')}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-white p-1 transition-opacity hover:opacity-80 cursor-pointer"
      >
        <img src="/reckon-mark.svg" alt="Reckon" className="h-full w-full object-contain" />
      </button>

      <div className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          aria-label="Project"
          title="Project"
          className={`${railItem} bg-overlay/10 text-body`}
        >
          <Folder className="h-5 w-5" strokeWidth={2} />
          <span className="text-[9px] font-medium leading-none">Project</span>
        </button>
        <button
          type="button"
          aria-label="Community"
          title="Community"
          onClick={() => navigate('/dashboard?tab=community')}
          className={`${railItem} text-muted hover:bg-overlay/5 hover:text-body`}
        >
          <Globe className="h-5 w-5" strokeWidth={2} />
          <span className="text-[9px] font-medium leading-none">Community</span>
        </button>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => navigate('/settings')}
          className={`${railItem} text-muted hover:bg-overlay/5 hover:text-body`}
        >
          <Settings className="h-5 w-5" strokeWidth={2} />
          <span className="text-[9px] font-medium leading-none">Settings</span>
        </button>
      </div>

      <div className="flex-1" />

      <div className="relative" ref={profileRef}>
        <button
          type="button"
          aria-label="Profile"
          title="Profile"
          onClick={() => setProfileOpen((o) => !o)}
          className={`${railItem} ${
            profileOpen ? 'bg-overlay/10 text-body' : 'text-muted hover:bg-overlay/5 hover:text-body'
          }`}
        >
          <User className="h-5 w-5" strokeWidth={2} />
          <span className="text-[9px] font-medium leading-none">Profile</span>
        </button>

        {profileOpen && (
          <div className="absolute bottom-full left-2 z-30 mb-2 w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-fg">
                {(user?.name ?? user?.email ?? 'R').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-body">
                  {user?.name ?? 'You'}
                </p>
                <p className="truncate text-xs text-muted">{user?.email ?? ''}</p>
              </div>
            </div>
            <div className="mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body hover:bg-overlay/5 transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-muted" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};

export default SidebarRail;
