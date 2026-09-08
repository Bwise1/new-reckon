import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { beginSignIn, completeSignIn, suiteAuthEnabled } from '@/lib/suiteAuth';
import Logo from '@/assets/images/logo_blue.svg';

/**
 * /auth/callback — where the suite portal sends the browser after sign-in.
 *
 * Exchanges the one-time code for tokens and moves on; the person should
 * see this page for well under a second. The exchange runs exactly once even
 * under React StrictMode's double-mount, because the code is single-use and
 * a second attempt would fail with a confusing error.
 */

/** What is wrong with the callback URL itself, decided before any request. */
const urlProblem = (params: URLSearchParams): string | null => {
  // The identity service reports a refused /authorize this way.
  if (params.get('error')) return params.get('error_description') || 'Sign-in was cancelled.';
  if (!params.get('code') || !params.get('state')) {
    return 'This sign-in link is incomplete. Please sign in again.';
  }
  return null;
};

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Problems visible in the URL are known at first render; only the
  // exchange's outcome arrives later.
  const [error, setError] = useState<string | null>(() => urlProblem(params));
  const started = useRef(false);

  useEffect(() => {
    if (started.current || error) return;
    started.current = true;

    if (!suiteAuthEnabled()) {
      navigate('/login', { replace: true });
      return;
    }
    completeSignIn(params.get('code') as string, params.get('state') as string)
      .then((destination) => navigate(destination, { replace: true }))
      .catch((e: unknown) => setError((e as Error).message || 'Sign-in could not be completed.'));
  }, [params, navigate, error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <img src={Logo} alt="" className="h-6 w-6" />
          <span className="text-sm font-semibold text-body">Reckon Bill</span>
        </div>
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-body">Couldn't sign you in</h1>
            <p className="mt-2 text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={() => void beginSignIn('login')}
              className="mt-5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 cursor-pointer"
            >
              Try again
            </button>
          </>
        ) : (
          <p className="text-sm text-muted">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
