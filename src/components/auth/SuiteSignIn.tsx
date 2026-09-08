import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AuthLayout from '@/layouts/AuthLayout';
import { beginSignIn, portalOrigin } from '@/lib/suiteAuth';

/**
 * The /login and /signup pages when sign-in goes through the suite portal.
 *
 * Normally this page is never seen: it sends the browser to the portal the
 * moment it mounts, and the portal's session cookie means a returning person
 * lands back here signed in without typing anything. It stays put in two
 * cases — right after signing out (auto-redirecting would look like sign-out
 * had failed, since the portal cookie signs them straight back in), and when
 * an earlier attempt ended in an error — and offers the buttons instead.
 */
export default function SuiteSignIn({ mode }: { mode: 'login' | 'signup' }) {
  const [params] = useSearchParams();
  const signedOut = params.get('signed_out') === '1';
  const [notice] = useState<string | null>(() => {
    const n = sessionStorage.getItem('reckon_auth_notice');
    if (n) sessionStorage.removeItem('reckon_auth_notice');
    return n;
  });

  useEffect(() => {
    if (!signedOut) void beginSignIn(mode);
  }, [mode, signedOut]);

  return (
    <AuthLayout>
      <div className="flex flex-col gap-4">
        {notice && (
          <div className="rounded-md border border-warn/30 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {notice}
          </div>
        )}
        {signedOut ? (
          <>
            <div>
              <h2 className="text-lg font-semibold text-body">You're signed out</h2>
              <p className="mt-1 text-sm text-muted">
                Sign in again to pick up where you left off.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void beginSignIn('login')}
              className="btn-primary font-bold text-lg"
            >
              Sign in
            </button>
            <a
              href={`${portalOrigin()}/logout`}
              className="text-center text-xs text-muted underline hover:text-body"
            >
              Sign out of every Reckon app
            </a>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              {mode === 'signup' ? 'Taking you to create your Reckon account…' : 'Taking you to Reckon sign-in…'}
            </p>
            <button
              type="button"
              onClick={() => void beginSignIn(mode)}
              className="text-sm text-accent underline text-left cursor-pointer"
            >
              Not redirected? Continue
            </button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
