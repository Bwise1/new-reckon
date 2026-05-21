import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTakeoffStore } from '@/store/useTakeoffStore';
import { useProject } from '@/hooks/useProjects';
import { openAuthenticatedDownload } from '@/lib/api-client';
import { buildBoqPayload, boqService } from '@/services/boq.service';

export function useBoqExport() {
  const { id: projectId } = useParams<{ id: string }>();
  const { data: projectResponse } = useProject(projectId ?? '');
  const project = projectResponse?.data?.project;
  const { boqElements, pricing, setPricing } = useTakeoffStore();

  const [exportModalMode, setExportModalMode] = useState<'preview' | 'export' | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const buildExportPayload = (vat: number, contingency: number) =>
    buildBoqPayload({
      projectId: projectId || 'local-web-project',
      title: project?.title ?? 'Bill of Quantities',
      location: project?.location ?? 'Lagos, Nigeria',
      elements: boqElements,
      contingency,
      vatRate: vat,
    });

  const openDownload = async (downloadUrl?: string) => {
    if (!downloadUrl) return;
    await openAuthenticatedDownload(downloadUrl);
  };

  const runPreview = async (vat: number, contingency: number) => {
    setPricing({ vatRate: vat, contingency });
    try {
      setBusyAction(true);
      setStatusMessage('');
      const payload = buildExportPayload(vat, contingency);
      const response = await boqService.previewPdf(payload);
      await openDownload(response.data.downloadUrl);
      setStatusMessage('Preview ready.');
    } catch (error) {
      setStatusMessage((error as Error).message || 'Preview failed.');
    } finally {
      setBusyAction(false);
      setExportModalMode(null);
    }
  };

  const runExport = async (vat: number, contingency: number) => {
    if (!projectId) {
      setStatusMessage('Project ID is missing.');
      setExportModalMode(null);
      return;
    }
    const storedUser = localStorage.getItem('user');
    const email = storedUser ? JSON.parse(storedUser).email : '';
    if (!email) {
      setStatusMessage('User email is required for payment.');
      setExportModalMode(null);
      return;
    }

    setPricing({ vatRate: vat, contingency });
    try {
      setBusyAction(true);
      setStatusMessage('');
      const payload = buildExportPayload(vat, contingency);
      const init = await boqService.initPayment(projectId, email);
      if (init.data.reference) {
        await boqService.verifyPayment(init.data.reference);
      }
      const exported = await boqService.exportPdf(payload, init.data.exportId);
      await openDownload(exported.data.downloadUrl);
      setStatusMessage('Export completed.');
    } catch (error) {
      setStatusMessage((error as Error).message || 'Export failed.');
    } finally {
      setBusyAction(false);
      setExportModalMode(null);
    }
  };

  const handleExportConfirm = (vat: number, contingency: number) => {
    if (exportModalMode === 'preview') {
      void runPreview(vat, contingency);
    } else if (exportModalMode === 'export') {
      void runExport(vat, contingency);
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
