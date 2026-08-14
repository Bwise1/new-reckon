/**
 * Closed-beta switch (build-time). Hides self-signup in the UI; the backend's
 * REGISTRATION_DISABLED flag is the actual gate — this is presentation only.
 * Kept in its own module so pages can read it without importing App.tsx
 * (which would be a circular import).
 */
export const REGISTRATION_DISABLED =
  import.meta.env.VITE_REGISTRATION_DISABLED === 'true';
