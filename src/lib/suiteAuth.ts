import { useAuthStore } from '@/stores/auth.store';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';
import { REQUEST_SOURCE } from '@/lib/api-client';
import type { User } from '@/types/auth';

/**
 * Sign-in through the Reckon Suite portal (OAuth authorization code + PKCE).
 *
 * With VITE_AUTH_URL set, this app has no login form of its own. It sends the
 * browser to the identity service's /authorize; the portal signs the person
 * in (or recognises its session cookie and skips the form — that is how a
 * second Reckon app opens without a second login), and comes back to
 * /auth/callback with a one-time code, which is exchanged here for tokens.
 *
 * PKCE is what makes this safe for a public client with no secret: the code
 * is bound to a verifier only this browser holds, so an intercepted code is
 * useless on its own. `state` ties the callback to the sign-in that started
 * it, so a callback URL pasted from elsewhere is refused.
 *
 * The suite access token IS the Bill API token (reckon_api verifies it via
 * the identity service's JWKS and maps the account to a users row), so it is
 * stored as both `token` and `identityToken`, the same as the older
 * password-based accounts login did.
 */

const AUTH_URL = import.meta.env.VITE_AUTH_URL || null;
const API_URL = import.meta.env.VITE_API_URL || 'https://api.reckonio.com/v1';

export const CLIENT_ID = 'reckon-bill';

/** True when sign-in goes through the suite portal rather than a local form. */
export const suiteAuthEnabled = (): boolean => Boolean(AUTH_URL);

/** The portal's origin, e.g. https://identity.reckonio.com — its pages live at the root. */
export const portalOrigin = (): string => new URL(AUTH_URL as string).origin;

/** Path (not URL) of /authorize on the identity service, for the portal's return_to. */
const authorizePath = (): string =>
  `${new URL(AUTH_URL as string).pathname.replace(/\/$/, '')}/authorize`;

/** Must match a registered redirect URI for this client on the identity service. */
const redirectUri = (): string => `${window.location.origin}/auth/callback`;

const PKCE_KEY = 'reckon_pkce';
const RETURN_KEY = 'reckon_return_to';
export const PENDING_INVITE_KEY = 'reckon_pending_invite';
export const PENDING_ORG_INVITE_KEY = 'reckon_pending_org_invite';

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const randomString = (bytes: number): string => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
};

/** S256: base64url(SHA-256(verifier)), per RFC 7636. */
const challengeFor = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
};

/**
 * Remember where the person was going, so sign-in can bring them back.
 * Only a same-origin path is kept; the auth pages themselves are never a
 * destination (they would just bounce again).
 */
export const rememberReturnPath = (path: string): void => {
  if (!path.startsWith('/') || path.startsWith('//')) return;
  if (path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/auth/')) return;
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Storage blocked — they land on the dashboard instead.
  }
};

/**
 * Where to go once signed in: an invite link that sent the person here
 * first, then the page they were on, then the dashboard.
 */
export const destinationAfterSignIn = (): string => {
  const invite = localStorage.getItem(PENDING_INVITE_KEY);
  if (invite) return `/invite/${invite}`;
  const orgInvite = localStorage.getItem(PENDING_ORG_INVITE_KEY);
  if (orgInvite) return `/org-invite/${orgInvite}`;
  let returnTo: string | null = null;
  try {
    returnTo = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // ignore
  }
  return returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
};

/** A fresh /authorize path (with PKCE state stored for the callback). */
const newAuthorizeRequest = async (): Promise<string> => {
  const verifier = randomString(48);
  const state = randomString(24);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
    state,
  });
  return `${authorizePath()}?${params.toString()}`;
};

/**
 * Leave for the portal. `login` goes straight to /authorize, which shows the
 * login form only when there is no portal session; `signup` opens the
 * portal's signup page with /authorize as its return_to, so creating and
 * verifying the account flows straight back here signed in.
 */
export const beginSignIn = async (mode: 'login' | 'signup' = 'login'): Promise<void> => {
  const authorize = await newAuthorizeRequest();
  const target =
    mode === 'signup'
      ? `${portalOrigin()}/signup?return_to=${encodeURIComponent(authorize)}`
      : `${portalOrigin()}${authorize}`;
  window.location.assign(target);
};

interface TokenResponse {
  status: string;
  message?: string;
  data?: { token: string; refreshToken: string };
}

interface BillProfileResponse {
  data?: {
    user?: { id: number | string; email: string; firstName?: string | null; lastName?: string | null };
  };
  message?: string;
}

/** The `sub` (account id) of a JWT, without verifying it — display only. */
const subjectOf = (jwt: string): string | null => {
  try {
    const payload = jwt.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
};

/**
 * Finish sign-in on /auth/callback: exchange the code for tokens, find out
 * who this person is in Reckon Bill, and store the session. Returns the path
 * to navigate to.
 *
 * "Who this is in Bill" comes from Bill's own /users/profile with the new
 * token, not from the identity service: reckon_api provisions a users row
 * for a first-time account on that very request, and the numeric users.id it
 * answers with is what the rest of the app (ownership, realtime echoes)
 * compares against.
 */
export const completeSignIn = async (code: string, state: string): Promise<string> => {
  let pkce: { verifier: string; state: string } | null = null;
  try {
    pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? 'null');
  } catch {
    pkce = null;
  }
  sessionStorage.removeItem(PKCE_KEY);
  if (!pkce || pkce.state !== state) {
    throw new Error('This sign-in did not start in this browser. Please sign in again.');
  }

  const tokenRes = await fetch(`${AUTH_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      code_verifier: pkce.verifier,
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(),
    }),
  });
  const tokenBody = (await tokenRes.json().catch(() => ({}))) as TokenResponse;
  if (!tokenRes.ok || !tokenBody.data?.token) {
    throw new Error(tokenBody.message || 'Sign-in could not be completed. Please try again.');
  }
  const { token, refreshToken } = tokenBody.data;

  const profileRes = await fetch(`${API_URL}/users/profile`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Request-Source': REQUEST_SOURCE },
  });
  const profileBody = (await profileRes.json().catch(() => ({}))) as BillProfileResponse;
  const billUser = profileBody.data?.user;
  if (!profileRes.ok || !billUser) {
    throw new Error(profileBody.message || 'Signed in, but Reckon Bill did not recognise this account.');
  }

  const user: User = {
    id: String(billUser.id),
    email: billUser.email,
    name: [billUser.firstName, billUser.lastName].filter(Boolean).join(' ') || undefined,
  };

  localStorage.setItem('identityToken', token);
  const accountId = subjectOf(token);
  if (accountId) localStorage.setItem('accountId', accountId);
  useAuthStore.getState().setAuth(user, token, refreshToken);
  await useWorkspaceStore.getState().load();

  return destinationAfterSignIn();
};

/**
 * Sign out: forget the session here, revoke it on the identity service, and
 * end the portal's session too. The last part matters because /login sends
 * the browser straight to /authorize, where a surviving portal cookie would
 * sign the person back in without a form — sign-out would look broken. The
 * portal's /logout shows its login form and, with return_to, brings a
 * sign-in from there straight back to this app.
 */
export const signOut = async (): Promise<never> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (refreshToken) {
    // Best effort; a failure here only leaves a refresh token that expires anyway.
    void fetch(`${AUTH_URL}/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      keepalive: true,
    }).catch(() => undefined);
  }
  const authorize = await newAuthorizeRequest();
  // Leave FIRST, and never touch the auth store: emptying it would make
  // ProtectedRoute redirect to /login, whose own trip to /authorize would
  // win the race against this navigation and — the portal cookie still
  // being alive at that instant — sign the person straight back in.
  window.location.assign(`${portalOrigin()}/logout?return_to=${encodeURIComponent(authorize)}`);
  for (const key of ['token', 'user', 'refreshToken', 'identityToken', 'accountId']) {
    localStorage.removeItem(key);
  }
  // The page is unloading; nothing after this should run.
  return new Promise<never>(() => undefined);
};
