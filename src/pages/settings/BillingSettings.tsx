import { useMemo, useState } from 'react';
import { Check, Info } from 'lucide-react';
import SettingsLayout from '@/layouts/SettingsLayout';
import { SettingsCard } from '@/components/settings/primitives';
import StorageMeter from '@/components/settings/StorageMeter';
import DailyPlanCard from '@/components/settings/DailyPlanCard';
import UpgradePlansModal from '@/components/settings/UpgradePlansModal';
import UpgradeModal from '@/components/settings/UpgradeModal';
import BuyStorageModal from '@/components/settings/BuyStorageModal';
import {
  DAILY_PLAN_RATE,
  PLANS,
  STORAGE_PACK_GB,
  planFor,
  useWorkspaceSettings,
  type Plan,
} from '@/lib/workspace-settings';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

function priceText(plan: Plan, cycle: 'monthly' | 'annual') {
  if (plan.monthly === null) return 'Custom pricing';
  if (plan.monthly === 0) return 'Free forever';
  if (cycle === 'annual') return `₦${(plan.monthly * 10).toLocaleString('en-US')} / yr`;
  return `₦${plan.monthly.toLocaleString('en-US')} / mo`;
}

function storageText(gb: number) {
  return gb >= 1000 ? `${gb / 1000} TB storage` : `${gb} GB storage`;
}

export default function BillingSettings() {
  const activeOrgId = useWorkspaceStore((s) => s.activeOrgId);
  const [settings, update] = useWorkspaceSettings(activeOrgId);
  const [picking, setPicking] = useState(false);
  const [pending, setPending] = useState<Plan | null>(null);
  const [buyingStorage, setBuyingStorage] = useState(false);

  const current = planFor(settings.planTier);
  const storageLimitGb = current.storageLimitGb + settings.storageAddonGb;
  const currentIndex = useMemo(
    () => Math.max(0, PLANS.findIndex((plan) => plan.tier === settings.planTier)),
    [settings.planTier],
  );
  const upgrades = PLANS.slice(currentIndex + 1);

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-muted/50 px-4 py-3 text-xs text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Payments aren’t live yet. You can explore plans and storage here; your selection is
            saved to this device until billing is switched on.
          </span>
        </div>

        <SettingsCard
          title="Your plan"
          description="Your workspace subscription and cloud storage."
          action={
            <span className="rounded-full border border-border bg-overlay/10 px-3 py-1 text-xs font-semibold text-body">
              {current.name}
            </span>
          }
          footer={
            upgrades.length > 0 ? (
              <>
                <span className="text-xs text-muted">
                  {upgrades.length} higher {upgrades.length === 1 ? 'tier' : 'tiers'} available
                </span>
                <button type="button" onClick={() => setPicking(true)}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90">
                  Upgrade plan
                </button>
              </>
            ) : (
              <span className="text-xs text-muted">You are on the highest tier available.</span>
            )
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-body">{current.name}</div>
                <div className="text-xs text-muted">{current.audience} · {storageText(current.storageLimitGb)}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-body">{priceText(current, settings.billingCycle)}</div>
            </div>

            <ul className="grid gap-1.5 sm:grid-cols-2">
              {current.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-xs text-muted">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="border-t border-border pt-4">
              <StorageMeter usedGb={settings.storageUsedGb} limitGb={storageLimitGb} />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {settings.storageAddonGb > 0
                    ? `Includes +${settings.storageAddonGb} GB in add-on storage`
                    : `Plan limit: ${storageText(current.storageLimitGb)}`}
                </span>
                <button type="button" onClick={() => setBuyingStorage(true)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-surface-muted">
                  Buy more storage
                </button>
              </div>
            </div>
          </div>
        </SettingsCard>

        <DailyPlanCard
          active={settings.dailyPlanActive}
          rate={DAILY_PLAN_RATE}
          onToggle={() => update({ dailyPlanActive: !settings.dailyPlanActive })}
        />

        <UpgradePlansModal
          open={picking}
          plans={upgrades}
          billingCycle={settings.billingCycle}
          onCycleChange={(billingCycle) => update({ billingCycle })}
          onClose={() => setPicking(false)}
          onSelectPlan={(plan) => { setPicking(false); setPending(plan); }}
        />

        <UpgradeModal
          open={pending !== null}
          plan={pending}
          billingCycle={settings.billingCycle}
          onClose={() => setPending(null)}
          onConfirm={() => { if (pending && pending.monthly !== null) update({ planTier: pending.tier }); }}
        />

        <BuyStorageModal
          open={buyingStorage}
          currentAddonGb={settings.storageAddonGb}
          onClose={() => setBuyingStorage(false)}
          onConfirm={() => update({ storageAddonGb: settings.storageAddonGb + STORAGE_PACK_GB })}
        />
      </div>
    </SettingsLayout>
  );
}
