// Bake a rotation (0/90/180/270°) into an image, returning a new
// HTMLImageElement. Image plans (PNG/JPEG/rasterized DXF) can't rotate the way
// PDFs do (pdf.js re-renders at a rotation), so we redraw the source onto a
// rotated offscreen canvas — the canvas then just consumes the already-rotated
// bitmap, keeping measurement points, scale, and calibration consistent.

/**
 * Return a new HTMLImageElement of `source` rotated clockwise by `degrees`
 * (normalized to 0/90/180/270). For 0° the source is returned unchanged.
 */
export function rotateImageElement(
  source: HTMLImageElement,
  degrees: number
): Promise<HTMLImageElement> {
  const deg = ((degrees % 360) + 360) % 360;
  if (deg === 0) return Promise.resolve(source);

  const w = source.naturalWidth || source.width;
  const h = source.naturalHeight || source.height;

  const canvas = document.createElement('canvas');
  // 90/270 swap width and height.
  if (deg === 90 || deg === 270) {
    canvas.width = h;
    canvas.height = w;
  } else {
    canvas.width = w;
    canvas.height = h;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(source);

  ctx.save();
  switch (deg) {
    case 90:
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 180:
      ctx.translate(canvas.width, canvas.height);
      ctx.rotate(Math.PI);
      break;
    case 270:
      ctx.translate(0, canvas.height);
      ctx.rotate((3 * Math.PI) / 2);
      break;
  }
  ctx.drawImage(source, 0, 0, w, h);
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(source);
    img.src = dataUrl;
  });
}
