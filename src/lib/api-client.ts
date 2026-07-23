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
  async downloadBlob(url: string): Promise<Blob> {
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

    return blob;
  }
}

export const apiClient = new APIClient();

/** Open preview/export PDF or Excel in a new tab with required API headers. */
export async function openAuthenticatedDownload(downloadUrl: string): Promise<void> {
  const blob = await apiClient.downloadBlob(downloadUrl);
  const blobUrl = URL.createObjectURL(blob);
  const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    URL.revokeObjectURL(blobUrl);
    throw new Error('Pop-up blocked. Allow pop-ups to view the download.');
  }
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
