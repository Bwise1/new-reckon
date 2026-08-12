import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * "A new version is available" banner (like Figma/Sertifier-style update
 * prompts). With registerType: 'prompt', a fresh deploy installs the new
 * service worker in the background and sets needRefresh — we surface a banner
 * so the user updates when ready, instead of silently serving stale code until
 * a hard refresh. Clicking Update activates the new worker and reloads.
 */
export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 rounded-xl bg-[#003566] text-white px-4 py-3 shadow-2xl text-sm">
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded-lg bg-[#289693] px-3 py-1.5 font-semibold hover:bg-[#1f7a77] transition-colors cursor-pointer"
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="rounded-lg px-2 py-1.5 text-white/70 hover:text-white transition-colors cursor-pointer"
      >
        Later
      </button>
    </div>
  );
}
