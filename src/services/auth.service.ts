import axios from 'axios';
import { apiClient } from '@/lib/api-client';
import type { AuthResponse, LoginRequest, SignupRequest, VerifyEmailRequest } from '@/types/auth';

/**
 * Login can be served either by Reckon Bill's own API (the original path) or
 * by the identity service at accounts.reckonio.com. Set VITE_AUTH_URL to the
 * accounts base (e.g. https://identity.reckonio.com/v1/accounts) to switch.
 *
 * Env-gated on purpose: ororo can use accounts while production stays on
 * reckon_api from the same build, and rolling back is a config change rather
 * than a redeploy.
 *
 * Only LOGIN moves. Registration, email verification and password reset still
 * go to Reckon Bill. The accounts service does expose /auth/google and
 * /auth/apple, but no client uses them yet: a brand-new social sign-up there
 * gets an account with no reckon-bill product link, so it cannot reach the
 * Bill API until accounts can provision (or lazily link) a Bill user.
 */
const AUTH_URL = import.meta.env.VITE_AUTH_URL || null;

/** Shape returned by the accounts service. */
interface AccountsLoginResponse {
  status: string;
  message: string;
  data: {
    account: {
      id: string;
      displayName: string | null;
      status: string;
      identities: { provider: string; value: string; verified: boolean }[];
      /** This account's id in each product's own database, e.g. { 'reckon-bill': '6' } */
      products: Record<string, string>;
      createdAt?: string;
    };
    /** Identity token — for the accounts service itself. */
    token: string;
    refreshToken: string;
    /** One token per product, each carrying THAT product's user id. */
    productTokens?: Record<string, string>;
  };
}

/**
 * Log in via the identity service and translate its response into the shape
 * the app already expects.
 *
 * The important part: the token stored for API calls is the BILL token, not
 * the identity one. Reckon Bill's middleware reads a numeric user id from its
 * own claims, so the identity token (which carries an account UUID) would not
 * authenticate against it — by design, that separation is what stops one
 * product's token working against another.
 */
const loginViaAccounts = async (data: LoginRequest): Promise<AuthResponse> => {
  const response = await axios.post<AccountsLoginResponse>(
    `${AUTH_URL}/login`,
    data,
    { headers: { 'Content-Type': 'application/json' } }
  );

  const { account, token, refreshToken, productTokens } = response.data.data;
  const billToken = productTokens?.['reckon-bill'];

  if (!billToken) {
    // Without it the user would appear logged in but every API call would
    // 401. Fail loudly here instead — this means BILL_JWT_SECRET is missing
    // on the accounts service, or the account has no Reckon Bill link.
    throw new Error(
      'Sign-in succeeded but this account has no Reckon access. Please contact support.'
    );
  }

  const email =
    account.identities.find((i) => i.provider === 'email')?.value ?? '';

  return {
    data: {
      user: {
        // Bill's numeric user id — what the rest of the app and its API expect.
        id: account.products['reckon-bill'],
        email,
        name: account.displayName ?? undefined,
        createdAt: account.createdAt,
      },
      token: billToken,
      refreshToken,
      // Kept so a later step can call the accounts service (logout, /me)
      // without logging in again.
      identityToken: token,
      accountId: account.id,
    },
  };
};

export const authService = {
  login: (data: LoginRequest) => {
    if (AUTH_URL) return loginViaAccounts(data);
    return apiClient.post<AuthResponse>('/auth/login', data);
  },

  signup: (data: SignupRequest) => {
    return apiClient.post<AuthResponse>('/auth/register', data);
  },

  verifyEmail: (data: VerifyEmailRequest) => {
    return apiClient.post('/auth/verify-email', data);
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('identityToken');
    localStorage.removeItem('accountId');
  },
};
