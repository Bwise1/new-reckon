import { Lock, Unlock } from 'lucide-react';

type AccessPolicy = 'open' | 'restricted';

const OPTIONS: { value: AccessPolicy; label: string; description: string; icon: typeof Unlock }[] = [
  { value: 'open', label: 'Open Access', description: 'All team members can view and collaborate on all company projects.', icon: Unlock },
  { value: 'restricted', label: 'Restricted Access', description: 'Team members can only access projects they have been explicitly invited or assigned to.', icon: Lock },
];

/** Workspace Access Policy — ported from the prototype. */
export default function AccessPolicyCard({ policy, onChange, disabled }: {
  policy: AccessPolicy; onChange: (p: AccessPolicy) => void; disabled?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold text-body">Workspace Access Policy</h2>
      <p className="mt-0.5 text-xs text-muted">Control how team members can discover and open company projects.</p>
      <div className="mt-4 space-y-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = policy === option.value;
          return (
            <button key={option.value} type="button" disabled={disabled} onClick={() => onChange(option.value)}
              className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                isActive ? 'border-overlay/30 bg-overlay/10' : 'border-border hover:bg-overlay/5'} ${disabled ? '' : 'cursor-pointer'}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-overlay/15 text-body' : 'bg-surface-muted text-muted'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-body">{option.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
              </span>
              <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${isActive ? 'border-body' : 'border-overlay/15'}`}>
                {isActive && <span className="h-2 w-2 rounded-full bg-body" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
