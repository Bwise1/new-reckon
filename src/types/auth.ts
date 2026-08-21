export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
}

export interface AuthResponse {
  data: {
    user: User;
    /** Token for Reckon Bill's API. */
    token: string;
    refreshToken: string;
    /** Identity-service token, present only when logging in via accounts. */
    identityToken?: string;
    /** Account id in the identity service, present only via accounts. */
    accountId?: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}
