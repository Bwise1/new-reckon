import axios, { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.reckonio.com/v1';
export const REQUEST_SOURCE = 'web-app';
let isHandlingAuthFailure = false;

/** Error rejected by the response interceptor. Carries the HTTP status
 * (when the server responded) so callers like syncQueue can distinguish
 * a permanent 4xx from a transient network/5xx failure. */
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const handleUnauthorized = (message?: string): void => {
  if (isHandlingAuthFailure) return;
  const token = localStorage.getItem('token');
  if (!token) return;

  const normalized = (message ?? '').toLowerCase();
  const isAuthMessage =
    normalized.includes('authentication failed') ||
    normalized.includes('invalid token') ||
    normalized.includes('jwt') ||
    normalized.includes('expired') ||
    normalized.includes('unauthorized');

  if (!isAuthMessage && !normalized) return;

  isHandlingAuthFailure = true;
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(
      'reckon_auth_notice',
      'Your session expired. Please log in again.'
    );
  }
  useAuthStore.getState().clearAuth();

  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login');
  } else {
    isHandlingAuthFailure = false;
  }
};

const withRequestHeaders = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
  const headers = AxiosHeaders.from(config.headers as AxiosHeaders);

  // For multipart uploads (FormData), let Axios/the browser set the
  // Content-Type with the correct multipart boundary. Forcing
  // application/json here would break the upload — the server would
  // see a JSON body and Multer would find no file.
  const isFormData =
    typeof FormData !== 'undefined' && config.data instanceof FormData;
  if (!isFormData) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Request-Source', REQUEST_SOURCE);

  const token = localStorage.getItem('token');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return { ...config, headers };
};

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
    });

    this.client.interceptors.request.use(
      (config) => withRequestHeaders(config),
      (error) => Promise.reject(error)
    );

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<{ message?: string; status?: string } | Blob>) => {
        const data = error.response?.data;
        if (error.response?.status === 401) {
          // The Bill API token is the short-lived (15 min) suite token, and an
          // expired one 401s with "Token has expired" — a message the auth
          // filter below does not treat as a logout. So before anything else,
          // try to refresh the suite token once and replay the request; the
          // list silently blanking on expiry was this path doing nothing.
          const cfg = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
          if (cfg && !cfg._retried) {
            const { refreshIdentityToken } = await import('@/services/accounts.service');
            const fresh = await refreshIdentityToken();
            if (fresh) {
              cfg._retried = true;
              return this.client(withRequestHeaders(cfg));
            }
          }
          const rawMessage =
            data && typeof data === 'object' && !('arrayBuffer' in data)
              ? (data as { message?: string }).message
              : undefined;
          handleUnauthorized(rawMessage);
        }
        const status = error.response?.status;
        if (data instanceof Blob) {
          try {
            const text = await data.text();
            const parsed = JSON.parse(text) as { message?: string };
            if (status === 401) {
              handleUnauthorized(parsed.message);
            }
            return Promise.reject(new ApiError(parsed.message || 'Something went wrong', status));
          } catch {
            return Promise.reject(new ApiError(error.message || 'Something went wrong', status));
          }
        }
        const message =
          (data && typeof data === 'object' && 'message' in data && data.message) ||
          (typeof data === 'string' ? data : undefined) ||
          error.message ||
          'Something went wrong';
        return Promise.reject(new ApiError(message, status));
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  /** Multipart upload without forcing application/json Content-Type. */
  async postForm<T>(url: string, formData: FormData, config?: AxiosRequestConfig) {
    const headers = AxiosHeaders.from(config?.headers as AxiosHeaders);
    headers.set('X-Request-Source', REQUEST_SOURCE);
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    headers.delete('Content-Type');

    const response = await this.client.post<T>(url, formData, {
      ...config,
      headers,
    });
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig) {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  /** Fetch a generated file with auth + X-Request-Source (same as mobile dio.download). */
  async downloadBlob(url: string): Promise<{ blob: Blob; filename: string }> {
    const response = await this.client.get<Blob>(url, {
      responseType: 'blob',
    });

    const blob = response.data;
    const contentType = response.headers['content-type'] ?? '';

    if (contentType.includes('application/json') || blob.type.includes('json')) {
      const text = await blob.text();
      try {
        const err = JSON.parse(text) as { message?: string };
        throw new Error(err.message || 'Download failed');
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== 'Download failed') {
          throw parseError;
        }
        throw new Error(text || 'Download failed');
      }
    }

    // Prefer the server-supplied name (Content-Disposition), else the URL's
    // basename — never the blob UUID.
    const disposition = response.headers['content-disposition'] ?? '';
    const filename = filenameFromDisposition(disposition) || basenameFromUrl(url) || 'download';
    return { blob, filename };
  }
}

export const apiClient = new APIClient();

/** Pull "foo.pdf" out of a Content-Disposition header, if present. */
function filenameFromDisposition(disposition: string): string {
  // Handles: filename="foo.pdf", filename=foo.pdf, filename*=UTF-8''foo.pdf
  const star = /filename\*=(?:UTF-8'')?["']?([^"';]+)["']?/i.exec(disposition);
  if (star?.[1]) {
    try { return decodeURIComponent(star[1]); } catch { return star[1]; }
  }
  const plain = /filename=["']?([^"';]+)["']?/i.exec(disposition);
  return plain?.[1]?.trim() ?? '';
}

/** Last path segment of a URL, stripped of any query string. */
function basenameFromUrl(url: string): string {
  const path = url.split('?')[0].split('#')[0];
  return path.substring(path.lastIndexOf('/') + 1);
}

/** True when running inside the Tauri desktop shell (vs a plain browser/PWA). */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Download a generated PDF/Excel with its real filename (never the blob UUID).
 * - Web / PWA: triggers a normal browser download via <a download>.
 * - Desktop (Tauri): shows a native Save-As dialog and writes the file to disk.
 * The saved file can then be opened to view.
 */
export async function openAuthenticatedDownload(downloadUrl: string): Promise<void> {
  const { blob, filename } = await apiClient.downloadBlob(downloadUrl);

  if (isTauri()) {
    // Desktop: native Save-As. Dynamic import so the browser build never
    // pulls in the Tauri plugins.
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const ext = filename.split('.').pop() || '';
    const targetPath = await save({
      defaultPath: filename,
      filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined,
    });
    if (!targetPath) return; // user cancelled the dialog
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(targetPath, bytes);
    return;
  }

  // Web / PWA.
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
