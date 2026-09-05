/**
 * Trailing throttle: the first call goes out immediately, later calls inside
 * the window collapse to ONE call with the latest arguments at the window's
 * end. Nothing is ever lost — the final position/draft always lands.
 */
export const throttleTrailing = <A extends unknown[]>(
  fn: (...args: A) => void,
  intervalMs: number
): ((...args: A) => void) & { cancel: () => void } => {
  let last = 0;
  let timer: number | null = null;
  let pending: A | null = null;

  const flush = () => {
    timer = null;
    if (!pending) return;
    const args = pending;
    pending = null;
    last = Date.now();
    fn(...args);
  };

  const throttled = (...args: A) => {
    const now = Date.now();
    const elapsed = now - last;
    if (elapsed >= intervalMs && timer === null) {
      last = now;
      fn(...args);
      return;
    }
    pending = args;
    if (timer === null) {
      timer = window.setTimeout(flush, Math.max(0, intervalMs - elapsed));
    }
  };

  throttled.cancel = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    pending = null;
  };

  return throttled;
};
