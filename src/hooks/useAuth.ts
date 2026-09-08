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
    mutationFn: async () => {
      // With the suite portal, signOut leaves for the portal's logout and
      // never resolves (the page is unloading); the legacy path only
      // forgets local state and stays on this app's form.
      if (suiteAuthEnabled()) await signOut();
      else authService.logout();
    },
    onSuccess: () => {
      clearAuth();
      navigate('/login');
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
