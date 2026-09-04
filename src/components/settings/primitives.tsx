import type { ReactNode } from 'react';

/**
 * Shared field styling for settings surfaces — mirrors the dashboard modals so
 * every settings page reads as one system in light and dark. Ported from the
 * YemiKrist Reckon-Bill prototype.
 */
export const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/20 transition';

export function SettingsCard({
  title,
  description,
  action,
  children,
  footer,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-body">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
      {footer ? (
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  error,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
