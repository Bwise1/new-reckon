import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useProject } from '@/hooks/useProjects';
import { openAuthenticatedDownload } from '@/lib/api-client';
import { buildBoqPayload, boqService, hasExportableBoq } from '@/services/boq.service';
import type { ExportFormat } from '@/components/takeoff/BoqExportModal';

export function useBoqExport() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: projectResponse } = useProject(projectId ?? '');
  const project = projectResponse?.data?.project;
  // Per-field selectors: a whole-store subscription re-rendered every consumer
  // of this hook on any unrelated store mutation.
  const boqElements = useTakeoffStore((s) => s.boqElements);
  const collectBills = useTakeoffStore((s) => s.collectBills);
  const pricing = useTakeoffStore((s) => s.pricing);
  const setPricing = useTakeoffStore((s) => s.setPricing);

  const [exportModalMode, setExportModalMode] = useState<'preview' | 'export' | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const buildExportPayload = (vat: number, contingency: number) => {
    const bills = collectBills();
    return buildBoqPayload({
      projectId: projectId || 'local-web-project',
      title: project?.title ?? 'Bill of Quantities',
      location: project?.location ?? 'Lagos, Nigeria',
      // Flat list keeps older servers working; bills drive the sheet-per-bill
      // workbook. Multi-bill projects flatten every bill into the PDF path.
      elements: bills.length > 1 ? bills.flatMap((b) => b.elements) : boqElements,
      bills: bills.map((b) => ({ name: b.name, elements: b.elements })),
      contingency,
      vatRate: vat,
    });
  };

  const openDownload = async (downloadUrl?: string) => {
    if (!downloadUrl) return;
    await openAuthenticatedDownload(downloadUrl);
  };

  const runPreview = async (vat: number, contingency: number, format: ExportFormat) => {
    if (!collectBills().some((b) => hasExportableBoq(b.elements))) {
      setStatusMessage('Add at least one item with a measurement or quantity before exporting.');
      setExportModalMode(null);
      return;
    }
    setPricing({ vatRate: vat, contingency });
    try {
      setBusyAction(true);
      setStatusMessage('');
      const payload = buildExportPayload(vat, contingency);
      const response = format === 'excel'
        ? await boqService.previewExcel(payload)
        : await boqService.previewPdf(payload);
      await openDownload(response.data.downloadUrl);
      setStatusMessage('Preview ready.');
    } catch (error) {
      setStatusMessage((error as Error).message || 'Preview failed.');
    } finally {
      setBusyAction(false);
      setExportModalMode(null);
    }
  };

  const runExport = async (vat: number, contingency: number, format: ExportFormat) => {
    if (!projectId) {
      setStatusMessage('Project ID is missing.');
      setExportModalMode(null);
      return;
    }
    if (!collectBills().some((b) => hasExportableBoq(b.elements))) {
      setStatusMessage('Add at least one item with a measurement or quantity before exporting.');
      setExportModalMode(null);
      return;
    }

    setPricing({ vatRate: vat, contingency });
    try {
      setBusyAction(true);
      setStatusMessage('');
      const payload = buildExportPayload(vat, contingency);
      // Exports are free — no payment step. The server generates a filename
      // suffix itself when exportId is omitted.
      const exportId = `${projectId}_${Date.now()}`;
      const exported = format === 'excel'
        ? await boqService.exportExcel(payload, exportId)
        : await boqService.exportPdf(payload, exportId);
      await openDownload(exported.data.downloadUrl);
      setStatusMessage('Export completed.');
    } catch (error) {
      setStatusMessage((error as Error).message || 'Export failed.');
    } finally {
      setBusyAction(false);
      setExportModalMode(null);
    }
  };

  const handleExportConfirm = (vat: number, contingency: number, format: ExportFormat) => {
    if (exportModalMode === 'preview') {
      void runPreview(vat, contingency, format);
    } else if (exportModalMode === 'export') {
      void runExport(vat, contingency, format);
    }
  };

  return {
    exportModalMode,
    setExportModalMode,
    busyAction,
    statusMessage,
    pricing,
    handleExportConfirm,
  };
}
