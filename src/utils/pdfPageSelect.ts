import { PDFDocument } from 'pdf-lib';

/**
 * Build a new PDF containing only the chosen pages (1-based, in the given
 * order), preserving vector content — no rasterization, so takeoff stays crisp
 * at any zoom. Returns a File so it flows through the existing upload path
 * unchanged, and so only the kept pages count against storage.
 */
export async function buildTrimmedPdf(
  source: File,
  pages: number[], // 1-based page numbers, already in desired order
): Promise<File> {
  const srcBytes = await source.arrayBuffer();
  const srcDoc = await PDFDocument.load(srcBytes);
  const out = await PDFDocument.create();

  // pdf-lib is 0-based; the picker hands us 1-based numbers.
  const zeroBased = pages.map((p) => p - 1).filter((i) => i >= 0 && i < srcDoc.getPageCount());
  const copied = await out.copyPages(srcDoc, zeroBased);
  copied.forEach((page) => out.addPage(page));

  const bytes = await out.save();
  // pdf-lib's Uint8Array is typed over ArrayBufferLike, which the Blob
  // constructor's types reject. Re-view the same buffer (no copy — the
  // trimmed PDF can be hundreds of MB) and narrow the type for TS.
  const part = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Uint8Array<ArrayBuffer>;
  const blob = new Blob([part], { type: 'application/pdf' });
  // Name it so the original stem is recognizable but clearly a selection.
  const stem = source.name.replace(/\.pdf$/i, '');
  const name = pages.length === srcDoc.getPageCount() ? source.name : `${stem} (${pages.length} pages).pdf`;
  return new File([blob], name, { type: 'application/pdf' });
}
