import axios, { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.reckonio.com/v1';
export const REQUEST_SOURCE = 'web-app';

const withRequestHeaders = (config: AxiosRequestConfig): AxiosRequestConfig => {
  const headers = AxiosHeaders.from(config.headers);
  headers.set('Content-Type', 'application/json');
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
        if (data instanceof Blob) {
          try {
            const text = await data.text();
            const parsed = JSON.parse(text) as { message?: string };
            return Promise.reject(new Error(parsed.message || 'Something went wrong'));
          } catch {
            return Promise.reject(new Error(error.message || 'Something went wrong'));
          }
        }
        const message =
          (data && typeof data === 'object' && 'message' in data && data.message) ||
          (typeof data === 'string' ? data : undefined) ||
          error.message ||
          'Something went wrong';
        return Promise.reject(new Error(message));
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

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    const response = await this.client.put<T>(url, data, config);
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
