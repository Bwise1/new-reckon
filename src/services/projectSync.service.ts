/**
 * Legacy wholesale project sync — replaced by per-entity endpoints.
 * See docs/sync-rebuild.md.
 *
 * This module now exists only as a shim so a couple of leftover call sites
 * (e.g. useCanvasMedia's plan-recovery early-out) continue to compile. All
 * data actually flows through `entitySync.service` + `syncQueue`.
 */

// Kept as an always-false stub because the old auto-disable-on-404 semantics
// no longer make sense once every entity has its own REST endpoint. If a
// specific plan fetch fails, useCanvasMedia surfaces the error directly.
export const isProjectSyncDisabled = (_projectId: string): boolean => {
  void _projectId;
  return false;
};
