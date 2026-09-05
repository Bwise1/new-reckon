/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_AUTH_URL?: string;
  /** `off` disables live collaboration (no socket is opened). Default on. */
  readonly VITE_REALTIME?: string;
}
