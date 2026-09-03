import { useEffect, useRef } from 'react';
import { LayoutGrid, List, Plus, Search } from 'lucide-react';

export type ProjectTab = 'all' | 'mine' | 'shared';
export type SortOption = 'lastModified' | 'name';
export type ViewMode = 'grid' | 'list';

const TABS: { value: ProjectTab; label: string }[] = [
  { value: 'all', label: 'All Projects' },
  { value: 'mine', label: 'My Projects' },
  { value: 'shared', label: 'Shared with Me' },
];

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  activeTab: ProjectTab;
  onTabChange: (value: ProjectTab) => void;
  onNewProject: () => void;
  canCreateProject: boolean;
};

/** Search (⌘K), sort, grid/list, New Project, and the All / Mine / Shared tabs. */
export default function ProjectsToolbar({
  search,
  onSearchChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  activeTab,
  onTabChange,
  onNewProject,
  canCreateProject,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="border-b border-border bg-surface px-6 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search projects…"
            className="w-full rounded-lg border border-border bg-surface-muted py-2 pl-9 pr-16 text-sm text-body outline-none placeholder:text-muted focus:border-accent focus:bg-surface focus:ring-2 focus:ring-accent/20 transition"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
            ⌘K
          </kbd>
        </div>

        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as SortOption)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none focus:border-accent transition"
        >
          <option value="lastModified">Sort: Last Modified</option>
          <option value="name">Sort: Name</option>
        </select>

        <div className="flex shrink-0 items-center rounded-lg border border-border bg-surface p-0.5">
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => onViewModeChange('grid')}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
              viewMode === 'grid' ? 'bg-overlay/10 text-body' : 'text-muted hover:text-body'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="List view"
            onClick={() => onViewModeChange('list')}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors cursor-pointer ${
              viewMode === 'list' ? 'bg-overlay/10 text-body' : 'text-muted hover:text-body'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {canCreateProject && (
          <button
            type="button"
            onClick={onNewProject}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        )}
      </div>

      <nav className="mt-4 flex items-center gap-5">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
            className={`border-b-2 pb-2.5 text-sm transition-colors cursor-pointer ${
              activeTab === tab.value
                ? 'border-body font-semibold text-body'
                : 'border-transparent text-muted hover:text-body'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
