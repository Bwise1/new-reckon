import { create } from 'zustand';
import type { User } from '@/types/auth';
import { identifyUser, clearUser } from '@/lib/analytics';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string, refreshToken: string) => void;
  clearAuth: () => void;
  initializeAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  setAuth: (user, token, refreshToken) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('refreshToken', refreshToken);

    // Attribute this tester's Matomo activity to their user id (not email).
    if (user?.id != null) identifyUser(user.id);

    set({
      user,
      token,
      isAuthenticated: true,
    });
  },

  clearAuth: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('refreshToken');

    // Detach analytics so a shared machine doesn't credit the next person's
    // session to whoever just logged out.
    clearUser();

    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  initializeAuth: () => {
    try {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');

      if (token && userStr) {
        const user = JSON.parse(userStr);
        // Returning tester with a live session — re-attach their id so this
        // visit is attributed without needing a fresh login.
        if (user?.id != null) identifyUser(user.id);
        set({
          user,
          token,
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
      });
    }
  },
}));

// Hydrate from localStorage before the first render to avoid a login flash on "/".
useAuthStore.getState().initializeAuth();
