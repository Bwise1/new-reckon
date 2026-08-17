import { apiClient } from '@/lib/api-client';

// Beta admin dashboard API. Goes through the shared apiClient so every call
// carries X-Request-Source (and the app's shared error handling). The admin
// session uses the backend's separate admin auth (/v1/admin/login, admins
// table), stored under its own key and passed explicitly per request — the
// client's interceptor injects the USER token, which is not what we want here.

const TOKEN_KEY = 'admin_token';

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY);
export const clearAdminToken = () => localStorage.removeItem(TOKEN_KEY);

/** Per-request config that swaps in the admin bearer token. */
const authCfg = () => {
  const token = getAdminToken();
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export interface AdminUserRow {
  id: number;
  email: string;
  is_active: 0 | 1;
  is_tester: 0 | 1;
  storage_quota_bytes: number;
  used_bytes: number;
  /** Null until the tester's first login (or before the tracking migration). */
  last_login_at: string | null;
  login_count: number;
  createdAt: string;
}

export interface TesterCreateResult {
  email: string;
  status: 'created' | 'exists' | 'invalid' | 'error';
  tempPassword?: string;
  emailSent?: boolean;
}

export interface FeedbackRow {
  id: number;
  user_email: string | null;
  category: string;
  severity: string;
  message: string;
  rating: number | null;
  context: Record<string, unknown> | string | null;
  screenshot_url: string | null;
  status: 'new' | 'reviewed' | 'resolved';
  created_at: string;
}

export const adminService = {
  async login(email: string, password: string): Promise<void> {
    // No admin token yet — the interceptor's user token (if any) is
    // irrelevant to this endpoint.
    const res = await apiClient.post<{ data: { token: string } }>(
      '/admin/login',
      { email, password }
    );
    localStorage.setItem(TOKEN_KEY, res.data.token);
  },

  createTesters(emails: string[], quotaMb: number, sendEmails: boolean) {
    return apiClient.post<{ data: { results: TesterCreateResult[] } }>(
      '/admin/testers',
      { emails, quotaMb, sendEmails },
      authCfg()
    );
  },

  listUsers() {
    return apiClient.get<{ data: { users: AdminUserRow[] } }>(
      '/admin/users',
      authCfg()
    );
  },

  updateUser(id: number, patch: { quotaMb?: number; is_active?: boolean }) {
    return apiClient.patch(`/admin/users/${id}`, patch, authCfg());
  },

  revokeAllTesters() {
    return apiClient.post<{ data: { revoked: number } }>(
      '/admin/testers/revoke',
      {},
      authCfg()
    );
  },

  reactivateAllTesters() {
    return apiClient.post<{ data: { reactivated: number } }>(
      '/admin/testers/reactivate',
      {},
      authCfg()
    );
  },

  listFeedback(filters: { status?: string; category?: string } = {}) {
    const q = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v) as [string, string][]
    ).toString();
    return apiClient.get<{ data: { feedback: FeedbackRow[] } }>(
      `/admin/feedback${q ? `?${q}` : ''}`,
      authCfg()
    );
  },

  setFeedbackStatus(id: number, status: string) {
    return apiClient.patch(`/admin/feedback/${id}`, { status }, authCfg());
  },

  async downloadFeedbackCsv(): Promise<void> {
    // Through the shared client (so X-Request-Source is applied) with the
    // admin token and a blob response type.
    const blob = await apiClient.get<Blob>('/admin/feedback.csv', {
      ...authCfg(),
      responseType: 'blob',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reckon-beta-feedback.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  },
};
