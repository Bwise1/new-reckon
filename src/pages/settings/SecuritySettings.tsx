import { useState } from 'react';
import SettingsLayout from '@/layouts/SettingsLayout';
import { SettingsCard, Field, inputClass } from '@/components/settings/primitives';
import SessionList from '@/components/settings/SessionList';
import { accountsEnabled } from '@/services/accounts.service';
import { useChangePassword, useProfile } from '@/hooks/useProfile';

function ChangePassword() {
  const { data: profileData, isPending: profilePending } = useProfile();
  // Decide social-only vs password only once the profile is known: defaulting
  // to "has password" while loading flashed the password UI for social users.
  // If the profile fails to load, fall back to the password form.
  const hasPassword = Boolean(profileData?.data?.user?.hasPassword ?? true);
  const { mutateAsync: changePassword, isPending } = useChangePassword();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm(''); setShow(false); setError(null);
  };

  const submit = async () => {
    setError(null);
    if (next.length < 8) return setError('Use at least 8 characters.');
    if (confirm !== next) return setError('Passwords do not match.');
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      reset();
      setEditing(false);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change password.');
    }
  };

  if (profilePending && !profileData) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3" aria-busy="true">
        <span className="h-4 w-64 max-w-full animate-pulse rounded bg-surface-muted" />
        <span className="h-9 w-36 animate-pulse rounded-md bg-surface-muted" />
      </div>
    );
  }

  if (!hasPassword) {
    return (
      <p className="text-sm text-muted">
        This account signs in with Google or Apple and has no password to change.
      </p>
    );
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {done ? 'Password updated.' : 'Use a strong password you don’t reuse elsewhere.'}
        </p>
        <button
          type="button"
          onClick={() => { setDone(false); setEditing(true); }}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-body transition-colors hover:bg-overlay/5"
        >
          Change password
        </button>
      </div>
    );
  }

  const type = show ? 'text' : 'password';
  return (
    <div className="space-y-4">
      <Field label="Current password" htmlFor="pw-current">
        <input id="pw-current" type={type} autoComplete="current-password" value={current}
          onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </Field>
      <Field label="New password" htmlFor="pw-new">
        <input id="pw-new" type={type} autoComplete="new-password" value={next}
          onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Confirm new password" htmlFor="pw-confirm" error={error}>
        <input id="pw-confirm" type={type} autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-accent" />
          Show passwords
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => { reset(); setEditing(false); }}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-50">
            {isPending ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SecuritySettings() {
  if (!accountsEnabled()) {
    return (
      <SettingsLayout>
        <SettingsCard title="Security">
          <p className="text-sm text-muted">Sign in through Reckon accounts to manage sessions and security.</p>
        </SettingsCard>
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <SettingsCard title="Change password" description="Use at least 8 characters with a mix of letters and numbers.">
          <ChangePassword />
        </SettingsCard>

        <SettingsCard title="Active sessions" description="Devices currently signed in to this account.">
          <SessionList />
        </SettingsCard>
      </div>
    </SettingsLayout>
  );
}
