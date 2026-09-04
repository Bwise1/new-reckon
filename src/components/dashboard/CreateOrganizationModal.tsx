import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTheme } from '@/hooks/useProjectTheme';

const TEAM_SIZES = ['1-10', '11-50', '51-200', '200+'] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  /** "create" makes a new org; "convert" turns the personal workspace into one. */
  mode?: 'create' | 'convert';
  pending?: boolean;
  onSubmit: (name: string, teamSize: string) => void;
};

/** Create New Organization — ported from the prototype (name + team size). */
export default function CreateOrganizationModal({ open, onClose, mode = 'create', pending, onSubmit }: Props) {
  const { theme } = useTheme();
  const [companyName, setCompanyName] = useState('');
  const [teamSize, setTeamSize] = useState<string>(TEAM_SIZES[0]);
  if (!open) return null;

  const isConvert = mode === 'convert';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || pending) return;
    onSubmit(companyName.trim(), teamSize);
  };

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={isConvert ? 'Convert to Organization' : 'Create New Organization'}
        className="w-full max-w-md rounded-xl border border-border bg-surface text-body shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-body">{isConvert ? 'Convert to Organization' : 'Create New Organization'}</h2>
          <button type="button" aria-label="Close" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="space-y-4 px-5 py-5">
            {isConvert && (
              <p className="text-xs text-muted">
                Your personal projects move into the new organization, and you can invite colleagues to work on them.
              </p>
            )}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Company Name</label>
              <input autoFocus required value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Apex Cost Consultants"
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 transition" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">Team Size</label>
              <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none focus:border-accent transition">
                {TEAM_SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body cursor-pointer">Cancel</button>
            <button type="submit" disabled={!companyName.trim() || pending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer">
              {pending ? (isConvert ? 'Converting…' : 'Creating…') : isConvert ? 'Convert Workspace' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
