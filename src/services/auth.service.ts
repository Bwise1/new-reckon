import { apiClient } from '@/lib/api-client';
import type { AuthResponse, LoginRequest, SignupRequest, VerifyEmailRequest } from '@/types/auth';

export const authService = {
  login: (data: LoginRequest) => {
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
  },
};
