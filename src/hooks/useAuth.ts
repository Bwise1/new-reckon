import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import type { LoginRequest, SignupRequest } from '@/types/auth';
import { destinationAfterSignIn, signOut, suiteAuthEnabled } from '@/lib/suiteAuth';

export function useLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  return useMutation({
    mutationFn: (data: LoginRequest) => authService.login(data),
    onSuccess: (response) => {
      const { user, token, refreshToken, identityToken, accountId } = response.data;
      // Keep the identity-service token separate from the API token: `token`
      // authenticates against Reckon Bill, `identityToken` against accounts
      // (logout, /me). Only present when logging in via the accounts service.
      if (identityToken) localStorage.setItem('identityToken', identityToken);
      if (accountId) localStorage.setItem('accountId', accountId);
      setAuth(user, token, refreshToken);
      // An invite link or a protected page that sent the person here resumes
      // after sign-in — the same rule the suite callback applies.
      navigate(destinationAfterSignIn());
    },
  });
}

export function useSignup() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: SignupRequest) => authService.signup(data),
    onSuccess: () => {
      navigate('/verify-email');
    },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((state) => state.clearAuth);

  return useMutation({
    mutationFn: () => {
      // signOut also revokes the session on the identity service when the
      // suite portal is in use; the legacy path only forgets local state.
      if (suiteAuthEnabled()) signOut();
      else authService.logout();
      return Promise.resolve();
    },
    onSuccess: () => {
      clearAuth();
      // signed_out=1 stops the login route bouncing straight back to the
      // portal, whose cookie would sign the person in again without a form.
      navigate(suiteAuthEnabled() ? '/login?signed_out=1' : '/login');
    },
  });
}

// Hook to get current auth state
export function useAuthState() {
  return useAuthStore((state) => ({
    user: state.user,
    token: state.token,
    isAuthenticated: state.isAuthenticated,
  }));
}
