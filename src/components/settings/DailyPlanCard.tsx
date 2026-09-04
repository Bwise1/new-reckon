import { Zap } from 'lucide-react';

type Props = { active: boolean; rate: number; onToggle: () => void };

/** Pay-per-active-day plan card. Ported from the prototype. */
export default function DailyPlanCard({ active, rate, onToggle }: Props) {
  return (
    <div className={`rounded-xl border p-5 transition-colors ${active ? 'border-overlay/30 bg-overlay/5' : 'border-dashed border-border bg-surface'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-overlay/15 text-body' : 'bg-surface-muted text-muted'}`}>
            <Zap className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-body">Daily Flex Plan</h3>
              {active ? (
                <span className="rounded-full bg-overlay/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-body">Active</span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Pay only for days you actually open a project. Billed nightly, with no monthly commitment.
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold tabular-nums text-body">₦{rate.toLocaleString('en-US')}</div>
          <div className="text-[11px] text-muted">per active day</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`mt-4 w-full rounded-md px-3 py-2 text-xs font-semibold transition ${active ? 'border border-border text-body hover:bg-overlay/5' : 'bg-primary text-primary-fg hover:opacity-90'}`}
      >
        {active ? 'Deactivate Daily Plan' : 'Activate Daily Plan'}
      </button>
    </div>
  );
}
