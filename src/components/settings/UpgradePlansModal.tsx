import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTheme } from '@/hooks/useProjectTheme';
import type { Plan } from '@/lib/workspace-settings';
import PlanCard from './PlanCard';

type Props = {
  open: boolean;
  plans: Plan[];
  billingCycle: 'monthly' | 'annual';
  onCycleChange: (cycle: 'monthly' | 'annual') => void;
  onClose: () => void;
  onSelectPlan: (plan: Plan) => void;
};

/** Plan picker with a monthly/annual toggle. Ported from the prototype. */
export default function UpgradePlansModal({ open, plans, billingCycle, onCycleChange, onClose, onSelectPlan }: Props) {
  const { theme } = useTheme();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4 py-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Upgrade your plan"
        className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-border bg-surface text-body shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-body">Upgrade your plan</h2>
            <p className="mt-0.5 text-xs text-muted">Pick a higher tier. You keep everything in your current plan.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4 flex justify-center">
            <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs font-medium">
              {(['monthly', 'annual'] as const).map((cycle) => (
                <button key={cycle} type="button" onClick={() => onCycleChange(cycle)}
                  className={`rounded-md px-3 py-1 capitalize transition-colors ${billingCycle === cycle ? 'bg-overlay/10 text-body' : 'text-muted hover:text-body'}`}>
                  {cycle}
                  {cycle === 'annual' ? <span className="ml-1 text-body">save 17%</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard key={plan.tier} plan={plan} current={false} billingCycle={billingCycle} onSelect={() => onSelectPlan(plan)} />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
