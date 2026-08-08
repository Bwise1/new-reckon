import type * as pdfjsLib from 'pdfjs-dist';

/**
 * Cached PDFDocumentProxy per plan. Dropping the Map entry alone does not free
 * anything: pdf.js holds the decoded document in its worker until destroy() is
 * called, so a long session that opens many plans grows without bound.
 */
const pdfByPlanId = new Map<string, pdfjsLib.PDFDocumentProxy>();

const destroyQuietly = (pdf: pdfjsLib.PDFDocumentProxy | undefined): void => {
  if (!pdf) return;
  try {
    void pdf.destroy();
  } catch (error) {
    console.warn('[planPdfCache] failed to destroy PDF document', error);
  }
};

export const setPlanPdf = (planId: string, pdf: pdfjsLib.PDFDocumentProxy): void => {
  const existing = pdfByPlanId.get(planId);
  // Replacing an entry must release the document it displaces.
  if (existing && existing !== pdf) destroyQuietly(existing);
  pdfByPlanId.set(planId, pdf);
};

export const getPlanPdf = (planId: string): pdfjsLib.PDFDocumentProxy | undefined =>
  pdfByPlanId.get(planId);

export const clearPlanPdf = (planId: string): void => {
  destroyQuietly(pdfByPlanId.get(planId));
  pdfByPlanId.delete(planId);
};

export const clearAllPlanPdfs = (): void => {
  for (const pdf of pdfByPlanId.values()) destroyQuietly(pdf);
  pdfByPlanId.clear();
};
