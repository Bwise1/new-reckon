/**
 * Canvas display preferences, persisted to localStorage. Small and dependency-
 * free — these are pure UI choices, no server round-trip needed.
 */

export type CanvasFitMode = "width" | "page";

const FIT_MODE_KEY = "reckon_canvas_fit_mode";

export const getCanvasFitMode = (): CanvasFitMode => {
  try {
    const v = localStorage.getItem(FIT_MODE_KEY);
    // Default: fit the whole page. Width-fit ignores height entirely, so tall
    // plans opened past the bottom of the viewport and had to be scrolled.
    return v === "width" ? "width" : "page";
  } catch {
    return "page";
  }
};

export const setCanvasFitMode = (mode: CanvasFitMode): void => {
  try {
    localStorage.setItem(FIT_MODE_KEY, mode);
    // Let open canvases react without a full reload.
    window.dispatchEvent(new CustomEvent("reckon:canvas-fit-mode", { detail: mode }));
  } catch {
    // ignore storage failures
  }
};
