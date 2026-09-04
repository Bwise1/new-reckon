import { Check } from 'lucide-react';
import type { Plan } from '@/lib/workspace-settings';

type Props = { plan: Plan; current: boolean; billingCycle: 'monthly' | 'annual'; onSelect: () => void };

function priceLabel(plan: Plan, cycle: 'monthly' | 'annual') {
  if (plan.monthly === null) return { big: 'Custom', small: 'Talk to sales' };
  if (plan.monthly === 0) return { big: 'Free', small: 'Forever' };
  if (cycle === 'annual') {
    const yearly = plan.monthly * 10;
    const perMonth = Math.round(yearly / 12);
    return { big: `₦${yearly.toLocaleString('en-US')}`, small: `per year (₦${perMonth.toLocaleString('en-US')}/mo)` };
  }
  return { big: `₦${plan.monthly.toLocaleString('en-US')}`, small: 'per month' };
}

function storageLabel(gb: number) {
  return gb >= 1000 ? `${gb / 1000} TB storage` : `${gb} GB storage`;
}

/** One plan tile in the upgrade picker. Ported from the prototype. */
export default function PlanCard({ plan, current, billingCycle, onSelect }: Props) {
  const price = priceLabel(plan, billingCycle);
  return (
    <div className={`flex flex-col rounded-xl border p-4 transition-colors ${current ? 'border-overlay/30 bg-overlay/5' : 'border-border bg-surface'}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-body">{plan.name}</h3>
        {current ? (
          <span className="rounded-full bg-overlay/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-body">Current</span>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-muted">{plan.audience}</p>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-body">{price.big}</span>
        <span className="text-xs text-muted">{price.small}</span>
      </div>
      <div className="mt-1 text-xs text-muted">{storageLabel(plan.storageLimitGb)}</div>

      <ul className="mt-3 space-y-1.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-xs">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="text-muted">{feature}</span>
          </li>
        ))}
      </ul>

      <div className="flex-1" />
      <button
        type="button"
        onClick={onSelect}
        disabled={current}
        className={`mt-4 w-full rounded-md px-3 py-2 text-xs font-semibold transition ${current ? 'cursor-default border border-border text-muted' : 'bg-primary text-primary-fg hover:opacity-90'}`}
      >
        {current ? 'Your plan' : plan.monthly === null ? 'Contact sales' : `Switch to ${plan.name}`}
      </button>
    </div>
  );
}
