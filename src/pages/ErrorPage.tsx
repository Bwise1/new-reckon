import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '@/assets/images/logo_blue.svg';

/**
 * The two dead ends this app had no answer for.
 *
 * A URL that matches no route rendered nothing at all — a blank page with no
 * error and no way back — and a render crash unmounted the whole tree to the
 * same blank page. Both now land here: the same card the invite and callback
 * pages use, saying what happened and offering a way on.
 *
 * Deliberately plain: no store, no query client, no theme hook. A crash page
 * that depends on the app's own machinery can crash while reporting a crash.
 */

const Card = ({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) => (
  <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
    <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <img src={Logo} alt="" className="h-6 w-6" />
        <span className="text-sm font-semibold text-body">Reckon Bill</span>
      </div>
      <h1 className="text-lg font-semibold text-body">{title}</h1>
      <p className="mt-2 text-sm text-muted">{body}</p>
      {children}
    </div>
  </div>
);

const primary =
  'mt-5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 cursor-pointer';
const secondary =
  'mt-2 w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-surface-muted cursor-pointer';

/** A URL that matches no route. */
export function NotFound() {
  const navigate = useNavigate();
  return (
    <Card
      title="Page not found"
      body="That address doesn't exist. It may have been mistyped, or the link that brought you here may be out of date."
    >
      <button type="button" onClick={() => navigate('/dashboard')} className={primary}>
        Go to your projects
      </button>
      <button type="button" onClick={() => navigate(-1)} className={secondary}>
        Go back
      </button>
    </Card>
  );
}

interface BoundaryState {
  error: Error | null;
}

/**
 * Catches a render crash anywhere below it. Recovery is a full page load, not
 * a state reset: whatever broke is in the tree we just tore down, and
 * re-rendering it usually breaks the same way.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing collects these yet; the console is what a tester can copy into
    // a bug report, and what shows up in a screen share.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Card
        title="Something went wrong"
        body="This page hit an error and stopped. Your saved work is unaffected — anything measured or typed was already synced."
      >
        <button type="button" onClick={() => window.location.reload()} className={primary}>
          Reload this page
        </button>
        <button
          type="button"
          onClick={() => window.location.assign('/dashboard')}
          className={secondary}
        >
          Go to your projects
        </button>
        {/* The message, for a bug report. The stack stays in the console. */}
        <p className="mt-4 break-words text-[11px] text-muted">{error.message}</p>
      </Card>
    );
  }
}
