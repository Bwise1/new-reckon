// Beta admin dashboard API. Uses the backend's EXISTING admin auth
// (/v1/admin/login — separate admins table + JWT), stored under its own
// localStorage key so it never mixes with the normal user session.

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.reckonio.com/v1';
const TOKEN_KEY = 'admin_token';

export const getAdminToken = () => localStorage.getItem(TOKEN_KEY);
export const clearAdminToken = () => localStorage.removeItem(TOKEN_KEY);

async function adminFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getAdminToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(init.body instanceof FormData) && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401 || res.status === 403) {
    clearAdminToken();
    throw new Error('Admin session expired — sign in again.');
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      msg = body.message || msg;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface AdminUserRow {
  id: number;
  email: string;
  is_active: 0 | 1;
  is_tester: 0 | 1;
  storage_quota_bytes: number;
  used_bytes: number;
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
    const res = await fetch(`${BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Login failed');
    localStorage.setItem(TOKEN_KEY, body.data.token);
  },

  createTesters(emails: string[], quotaMb: number, sendEmails: boolean) {
    return adminFetch<{ data: { results: TesterCreateResult[] } }>(
      '/admin/testers',
      {
        method: 'POST',
        body: JSON.stringify({ emails, quotaMb, sendEmails }),
      }
    );
  },

  listUsers() {
    return adminFetch<{ data: { users: AdminUserRow[] } }>('/admin/users');
  },

  updateUser(id: number, patch: { quotaMb?: number; is_active?: boolean }) {
    return adminFetch(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  revokeAllTesters() {
    return adminFetch<{ data: { revoked: number } }>('/admin/testers/revoke', {
      method: 'POST',
    });
  },

  reactivateAllTesters() {
    return adminFetch<{ data: { reactivated: number } }>(
      '/admin/testers/reactivate',
      { method: 'POST' }
    );
  },

  listFeedback(filters: { status?: string; category?: string } = {}) {
    const q = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v) as [string, string][]
    ).toString();
    return adminFetch<{ data: { feedback: FeedbackRow[] } }>(
      `/admin/feedback${q ? `?${q}` : ''}`
    );
  },

  setFeedbackStatus(id: number, status: string) {
    return adminFetch(`/admin/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async downloadFeedbackCsv(): Promise<void> {
    const token = getAdminToken();
    const res = await fetch(`${BASE_URL}/admin/feedback.csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error('CSV export failed');
    const blob = await res.blob();
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
