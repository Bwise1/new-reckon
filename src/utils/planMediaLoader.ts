import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export type PlanMediaKind = 'pdf' | 'image' | 'unknown';

export const isPdfMimeType = (mimeType?: string | null, url?: string): boolean => {
  if (mimeType === 'application/pdf') return true;
  if (mimeType?.includes('pdf')) return true;
  if (!url) return false;
  return (
    /\.pdf($|\?|#)/i.test(url) ||
    /\/raw\/upload\//i.test(url) ||
    /[?&]format=pdf/i.test(url) ||
    /\/f_pdf[,\/]/i.test(url)
  );
};

export const isImageMimeType = (mimeType?: string | null, url?: string): boolean => {
  if (mimeType?.startsWith('image/')) return true;
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|bmp)($|\?|#)/i.test(url);
};

const hasPdfFilename = (filename?: string | null): boolean =>
  Boolean(filename && /\.pdf$/i.test(filename));

const hasImageFilename = (filename?: string | null): boolean =>
  Boolean(filename && /\.(png|jpe?g|gif|webp|bmp)$/i.test(filename));

/** Best-effort media kind from plan metadata (before fetching the URL). */
export const inferPlanMediaKind = (plan: {
  mimeType?: string | null;
  url?: string | null;
  filename?: string | null;
  name?: string | null;
}): PlanMediaKind => {
  const filename = plan.filename ?? plan.name ?? undefined;
  if (isPdfMimeType(plan.mimeType, plan.url ?? undefined)) return 'pdf';
  if (hasPdfFilename(filename)) return 'pdf';
  if (isImageMimeType(plan.mimeType, plan.url ?? undefined)) return 'image';
  if (hasImageFilename(filename)) return 'image';
  return 'unknown';
};

export const loadPdfFromUrl = async (url: string): Promise<pdfjsLib.PDFDocumentProxy> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch plan PDF (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return pdfjsLib.getDocument({ data: buffer }).promise;
};

/** Load image from Cloudinary URL; returns the URL for use as img.src (with CORS). */
export const loadImageSourceFromUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch plan image (${response.status})`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
};

/**
 * Load a remote plan file. Tries PDF first when kind is unknown (common for architectural uploads).
 */
export const loadPlanFromRemoteUrl = async (
  url: string,
  plan: { mimeType?: string | null; filename?: string | null; name?: string | null }
): Promise<{ kind: 'pdf' | 'image'; pdf?: pdfjsLib.PDFDocumentProxy; imageSrc?: string }> => {
  const kind = inferPlanMediaKind({ ...plan, url });

  if (kind === 'pdf') {
    const pdf = await loadPdfFromUrl(url);
    return { kind: 'pdf', pdf };
  }

  if (kind === 'image') {
    const imageSrc = await loadImageSourceFromUrl(url);
    return { kind: 'image', imageSrc };
  }

  try {
    const pdf = await loadPdfFromUrl(url);
    return { kind: 'pdf', pdf };
  } catch {
    const imageSrc = await loadImageSourceFromUrl(url);
    return { kind: 'image', imageSrc };
  }
};
