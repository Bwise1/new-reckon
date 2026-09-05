/** Typography for on-canvas presence tags (name pills). */
export const PRESENCE_FONT = "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace";
export const TAG_FONT_SIZE = 11;
export const TAG_HEIGHT = 20;
export const TAG_PAD_X = 8;

let measureCtx: CanvasRenderingContext2D | null = null;
const textWidthCache = new Map<string, number>();

/** Width of a tag label in screen px (offscreen 2D canvas, memoised). */
export const measureTagText = (text: string): number => {
  const cached = textWidthCache.get(text);
  if (cached !== undefined) return cached;
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  let width = text.length * TAG_FONT_SIZE * 0.62;
  if (measureCtx) {
    measureCtx.font = `${TAG_FONT_SIZE}px ${PRESENCE_FONT}`;
    width = measureCtx.measureText(text).width;
  }
  textWidthCache.set(text, width);
  return width;
};
