import type * as pdfjsLib from 'pdfjs-dist';

const pdfByPlanId = new Map<string, pdfjsLib.PDFDocumentProxy>();

export const setPlanPdf = (planId: string, pdf: pdfjsLib.PDFDocumentProxy): void => {
  pdfByPlanId.set(planId, pdf);
};

export const getPlanPdf = (planId: string): pdfjsLib.PDFDocumentProxy | undefined =>
  pdfByPlanId.get(planId);

export const clearPlanPdf = (planId: string): void => {
  pdfByPlanId.delete(planId);
};

export const clearAllPlanPdfs = (): void => {
  pdfByPlanId.clear();
};
