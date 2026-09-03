import { useState } from 'react';
import { Check, ChevronDown, User } from 'lucide-react';
import { initials } from '@/lib/avatar';

/**
 * The workspace switcher from the prototype's sidebar. Today every account
 * has exactly one workspace — its personal space — so the menu lists that
 * one; organizations and educational hubs join the list when the org layer
 * ships (docs/buildout-plans.md).
 */
export default function WorkspaceSwitcher({ ownerName }: { ownerName: string }) {
  const [open, setOpen] = useState(false);
  const name = 'Personal Workspace';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg border border-overlay/10 bg-overlay/5 px-3 py-2.5 text-left transition-colors hover:bg-overlay/10 cursor-pointer"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-overlay/10 text-xs font-semibold text-body">
          {ownerName ? initials(ownerName) : <User className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-body">{name}</span>
          <span className="block truncate text-[11px] font-medium text-muted">Personal Space</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-full min-w-[220px] rounded-lg border border-border bg-surface py-1 shadow-lg">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-overlay/10 text-[10px] font-semibold text-body">
                {ownerName ? initials(ownerName) : '?'}
              </span>
              <span className="min-w-0 flex-1 truncate">{name}</span>
              <Check className="h-3.5 w-3.5 shrink-0 text-body" />
            </button>
            <div className="mx-1 my-1 h-px bg-border" />
            <p className="px-3 py-2 text-[11px] text-muted">
              Organizations and educational hubs are coming — you'll be able to switch between them here.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
