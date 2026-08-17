/**
 * Thin wrapper over the Matomo tracker loaded in index.html.
 *
 * Matomo pushes commands onto a global `_paq` array; the tracker (loaded async,
 * and skipped entirely on localhost) drains it. Because we push to that same
 * array, these calls are safe to make before — or even if — the tracker never
 * loads: they just queue and are ignored. So callers never need to guard.
 *
 * Beta only: this exists to answer "which tester spent how long, doing what".
 * We identify testers by user id, NOT email, so personal data stays out of the
 * analytics tool (a Matomo id maps back to a person only via our own DB).
 */

type Paq = Array<unknown[]>;

const paq = (): Paq | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { _paq?: Paq };
  // If Matomo was skipped (localhost/LAN, see index.html) _paq is undefined.
  // Create it so our calls queue harmlessly rather than throwing; nothing
  // drains the queue, so nothing is sent.
  if (!w._paq) w._paq = [];
  return w._paq;
};

/** Tie subsequent events to a specific tester. Call right after login. */
export const identifyUser = (userId: string | number) => {
  const q = paq();
  if (!q || userId == null) return;
  q.push(["setUserId", String(userId)]);
};

/** Forget the tester on logout so a shared machine doesn't attribute the next
 *  session to the previous person. resetUserId + a fresh visit. */
export const clearUser = () => {
  const q = paq();
  if (!q) return;
  q.push(["resetUserId"]);
  // Start a new visit so post-logout activity isn't merged into the old id.
  q.push(["appendToTrackingUrl", "new_visit=1"]);
  q.push(["trackPageView"]);
  q.push(["appendToTrackingUrl", ""]);
};

/**
 * Record a meaningful tester action (plan uploaded, measurement made, export).
 * category/action/name follow Matomo's event model; value is optional.
 */
export const trackEvent = (
  category: string,
  action: string,
  name?: string,
  value?: number
) => {
  const q = paq();
  if (!q) return;
  const event: unknown[] = ["trackEvent", category, action];
  if (name !== undefined) event.push(name);
  if (value !== undefined) event.push(value);
  q.push(event);
};
