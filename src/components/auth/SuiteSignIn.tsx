import { useEffect } from 'react';
import { beginSignIn } from '@/lib/suiteAuth';

/**
 * The /login and /signup routes when sign-in goes through the suite portal:
 * nothing to show, just leave for the portal. The line of text only ever
 * appears if the redirect is slow; the link covers a browser that blocked
 * it.
 */
export default function SuiteSignIn({ mode }: { mode: 'login' | 'signup' }) {
  useEffect(() => {
    void beginSignIn(mode);
  }, [mode]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <button
        type="button"
        onClick={() => void beginSignIn(mode)}
        className="text-sm text-muted hover:text-body cursor-pointer"
      >
        Taking you to Reckon sign-in… click here if nothing happens.
      </button>
    </div>
  );
}
