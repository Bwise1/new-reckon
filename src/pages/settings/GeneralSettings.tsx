import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import SettingsLayout from '@/layouts/SettingsLayout';
import { SettingsCard, Field, inputClass } from '@/components/settings/primitives';
import LogoUploader from '@/components/settings/LogoUploader';
import { accountsService, accountsEnabled } from '@/services/accounts.service';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

/** Lowercase, dash-separated handle, capped — mirrors the accounts service. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function GeneralSettings() {
  const orgs = useWorkspaceStore((s) => s.orgs);
  const activeOrgId = useWorkspaceStore((s) => s.activeOrgId);
  const loadWorkspaces = useWorkspaceStore((s) => s.load);
  const active = useMemo(
    () => orgs.find((o) => o.id === activeOrgId) ?? orgs.find((o) => o.kind === 'personal') ?? null,
    [orgs, activeOrgId],
  );
  const isOrg = active?.kind === 'organization' || active?.kind === 'educational';

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const loadedFor = useRef<string | null>(null);

  // Seed the form from the org's stored settings once per org.
  useEffect(() => {
    if (!isOrg || !active || !accountsEnabled()) return;
    if (loadedFor.current === active.id) return;
    loadedFor.current = active.id;
    accountsService
      .orgDetail(active.id)
      .then((d) => {
        setName(d.org.name ?? '');
        setSlug(d.org.slug ?? '');
        setLogoUrl(d.org.logoUrl ?? null);
      })
      .catch(() => {
        // Fall back to what the switcher already knows; reset all three so a
        // previous org's values cannot linger in the form.
        setName(active.name ?? '');
        setSlug(active.slug ?? '');
        setLogoUrl(null);
      });
  }, [isOrg, active]);

  // Debounced auto-save. Edits are MERGED into one pending patch and flushed
  // together: with a single `fields` per timer, typing a name and then a slug
  // inside the debounce window dropped the name.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const queueSave = (patch: Record<string, unknown>) => {
    if (!active) return;
    const orgId = active.id;
    pendingRef.current = { ...pendingRef.current, ...patch };
    setSaved('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const fields = pendingRef.current;
      pendingRef.current = {};
      try {
        await accountsService.updateOrg(orgId, fields);
        setSaveError(null);
        setSaved('done');
        void loadWorkspaces(); // pick up a rename in the switcher
      } catch (e) {
        // Surface the server's reason (e.g. 409 "That handle is already
        // taken") rather than a generic failure.
        setSaveError(e instanceof Error && e.message ? e.message : null);
        setSaved('error');
      }
    }, 600);
  };

  if (!accountsEnabled()) {
    return (
      <SettingsLayout>
        <SettingsCard title="Workspace identity">
          <p className="text-sm text-muted">
            Sign in through Reckon accounts to manage organization branding.
          </p>
        </SettingsCard>
      </SettingsLayout>
    );
  }

  if (!isOrg) {
    return (
      <SettingsLayout>
        <SettingsCard
          title="Personal workspace"
          description="Branding applies to organizations. Create or switch to an organization to set a name, handle, and logo."
        >
          <div className="flex items-center gap-3 text-sm text-muted">
            <Building2 className="h-5 w-5 shrink-0" />
            Your personal workspace uses your own profile. Company branding lives on organizations.
          </div>
        </SettingsCard>
      </SettingsLayout>
    );
  }

  const savedLabel =
    saved === 'saving' ? 'Saving…'
    : saved === 'done' ? 'Saved.'
    : saved === 'error' ? (saveError ?? 'Could not save.')
    : 'Changes save automatically.';

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <SettingsCard
          title="Workspace identity"
          description="The name and handle shown across Reckon Bill and on shared links."
          footer={
            <span className={`text-xs ${saved === 'error' ? 'text-danger' : 'text-muted'}`}>{savedLabel}</span>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workspace name" htmlFor="ws-name">
              <input
                id="ws-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  queueSave({ name: e.target.value });
                }}
                placeholder="Apex Cost Consultants"
                className={inputClass}
              />
            </Field>

            <Field label="Workspace slug" htmlFor="ws-slug" hint="Lowercase letters, numbers, and dashes.">
              <div className="flex items-center rounded-lg border border-border bg-surface transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
                <span className="pl-3 pr-1 text-sm text-muted">reckon.bill/</span>
                <input
                  id="ws-slug"
                  value={slug}
                  onChange={(e) => {
                    const s = slugify(e.target.value);
                    setSlug(s);
                    queueSave({ slug: s });
                  }}
                  placeholder="apex-cost"
                  className="w-full rounded-r-lg bg-transparent py-2 pr-3 text-sm text-body outline-none placeholder:text-muted/60"
                />
              </div>
            </Field>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Company / brand logo"
          description="Used on BOQ export headers and shared project links. PNG, JPG, or SVG, up to 2 MB."
        >
          <LogoUploader
            value={logoUrl}
            onChange={(next) => {
              setLogoUrl(next);
              queueSave({ logoUrl: next });
            }}
          />
        </SettingsCard>
      </div>
    </SettingsLayout>
  );
}
