import { useCallback, useEffect, useState } from 'react';

/**
 * Toggle browser fullscreen (F11-style) via the Fullscreen API. Targets the
 * document element by default so the whole app fills the screen. Tracks the
 * actual fullscreen state (which can change from the Esc key or the browser UI,
 * not just our button).
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement),
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      // Fullscreen can be blocked (permissions, iframe sandbox). Fail quietly.
      console.warn('[useFullscreen] toggle failed', error);
    }
  }, []);

  const supported =
    typeof document !== 'undefined' &&
    Boolean(document.documentElement.requestFullscreen);

  return { isFullscreen, toggle, supported };
}
