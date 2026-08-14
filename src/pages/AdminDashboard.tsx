import { useCallback, useEffect, useState } from 'react';
import {
  adminService,
  getAdminToken,
  clearAdminToken,
  type AdminUserRow,
  type FeedbackRow,
  type TesterCreateResult,
} from '@/services/admin.service';

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/**
 * Beta admin dashboard. Authenticates against the backend's separate admin
 * system (admins table) — completely independent of normal user sessions.
 */
export default function AdminDashboard() {
  const [authed, setAuthed] = useState(Boolean(getAdminToken()));
  return authed ? (
    <AdminPanel onLogout={() => { clearAdminToken(); setAuthed(false); }} />
  ) : (
    <AdminLogin onAuthed={() => setAuthed(true)} />
  );
}

function AdminLogin({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminService.login(email.trim(), password);
      onAuthed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[#f0f2f5]">
      <form onSubmit={submit} className="w-80 rounded-lg bg-white p-6 shadow-lg border border-gray-200 space-y-3">
        <h1 className="text-lg font-bold text-gray-900">Reckon Admin</h1>
        <input
          type="email" required placeholder="Admin email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#289693]"
        />
        <input
          type="password" required placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#289693]"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full rounded-md bg-[#003566] py-2 text-sm font-semibold text-white hover:bg-[#002847] disabled:opacity-50 cursor-pointer"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'testers' | 'feedback'>('testers');
  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="flex items-center justify-between bg-[#003566] px-6 py-3 text-white">
        <h1 className="font-bold">Reckon Admin — Beta</h1>
        <div className="flex items-center gap-3">
          <nav className="flex rounded-md bg-white/10 p-0.5 text-sm">
            {(['testers', 'feedback'] as const).map((t) => (
              <button
                key={t} type="button" onClick={() => setTab(t)}
                className={`rounded px-3 py-1 capitalize cursor-pointer ${tab === t ? 'bg-white text-[#003566] font-semibold' : 'text-white/80'}`}
              >
                {t}
              </button>
            ))}
          </nav>
          <button type="button" onClick={onLogout} className="text-sm text-white/80 hover:text-white cursor-pointer">
            Log out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        {tab === 'testers' ? <TestersTab /> : <FeedbackTab />}
      </main>
    </div>
  );
}

function TestersTab() {
  const [emailsText, setEmailsText] = useState('');
  const [quotaMb, setQuotaMb] = useState(30);
  const [sendEmails, setSendEmails] = useState(true);
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState<TesterCreateResult[] | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await adminService.listUsers();
      setUsers(res.data.users);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const create = async () => {
    const emails = emailsText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) return;
    setCreating(true);
    setMessage('');
    try {
      const res = await adminService.createTesters(emails, quotaMb, sendEmails);
      setResults(res.data.results);
      setEmailsText('');
      void refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const bulk = async (action: 'revoke' | 'reactivate') => {
    if (action === 'revoke' && !window.confirm('Deactivate ALL tester accounts?')) return;
    try {
      if (action === 'revoke') await adminService.revokeAllTesters();
      else await adminService.reactivateAllTesters();
      void refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const toggleActive = async (u: AdminUserRow) => {
    try {
      await adminService.updateUser(u.id, { is_active: !u.is_active });
      void refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const editQuota = async (u: AdminUserRow) => {
    const raw = window.prompt(`Quota for ${u.email} (MB, 0 = unlimited):`, mb(u.storage_quota_bytes));
    if (raw === null) return;
    const q = Number(raw);
    if (!Number.isFinite(q) || q < 0) return;
    try {
      await adminService.updateUser(u.id, { quotaMb: q });
      void refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-4 shadow border border-gray-200 space-y-3">
        <h2 className="font-semibold text-gray-900">Create tester accounts</h2>
        <textarea
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          placeholder={'one@example.com\ntwo@example.com'}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#289693]"
        />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Quota (MB)
            <input
              type="number" min={0} value={quotaMb}
              onChange={(e) => setQuotaMb(Number(e.target.value))}
              className="w-20 rounded-md border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} />
            Send invite emails
          </label>
          <button
            type="button" onClick={create} disabled={creating}
            className="rounded-md bg-[#289693] px-4 py-1.5 font-semibold text-white hover:bg-[#1f7a77] disabled:opacity-50 cursor-pointer"
          >
            {creating ? 'Creating…' : 'Create testers'}
          </button>
        </div>
        {results && (
          <div className="rounded-md bg-gray-50 p-3 text-xs space-y-1">
            <p className="font-semibold text-gray-700">
              Results (temp passwords shown ONCE — copy anything you need now):
            </p>
            {results.map((r) => (
              <div key={r.email} className="font-mono">
                {r.email} — {r.status}
                {r.tempPassword && <> — pw: <strong>{r.tempPassword}</strong></>}
                {r.status === 'created' && <> — email {r.emailSent ? 'sent' : 'FAILED (send manually)'}</>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg bg-white p-4 shadow border border-gray-200">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Users</h2>
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => bulk('revoke')} className="rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 cursor-pointer">
              Revoke all testers
            </button>
            <button type="button" onClick={() => bulk('reactivate')} className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
              Reactivate all
            </button>
          </div>
        </div>
        {message && <p className="mb-2 text-xs text-red-600">{message}</p>}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-gray-500">
              <th className="py-2">Email</th><th>Tester</th><th>Active</th>
              <th>Used / Quota (MB)</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="py-2">{u.email}</td>
                <td>{u.is_tester ? 'yes' : ''}</td>
                <td>{u.is_active ? '✓' : <span className="text-red-600">revoked</span>}</td>
                <td>{mb(u.used_bytes)} / {u.storage_quota_bytes === 0 ? '∞' : mb(u.storage_quota_bytes)}</td>
                <td className="space-x-2">
                  <button type="button" onClick={() => editQuota(u)} className="text-[#289693] hover:underline cursor-pointer">quota</button>
                  <button type="button" onClick={() => toggleActive(u)} className="text-[#289693] hover:underline cursor-pointer">
                    {u.is_active ? 'deactivate' : 'activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function FeedbackTab() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await adminService.listFeedback({ status, category });
      setRows(res.data.feedback);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }, [status, category]);
  useEffect(() => { void refresh(); }, [refresh]);

  const setRowStatus = async (id: number, s: string) => {
    try {
      await adminService.setFeedbackStatus(id, s);
      void refresh();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  return (
    <section className="rounded-lg bg-white p-4 shadow border border-gray-200">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <h2 className="font-semibold text-gray-900 mr-auto">Feedback</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1">
          <option value="">All statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="resolved">Resolved</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1">
          <option value="">All categories</option>
          <option value="bug">Bug</option>
          <option value="idea">Idea</option>
          <option value="usability">Usability</option>
          <option value="other">Other</option>
        </select>
        <button
          type="button"
          onClick={() => void adminService.downloadFeedbackCsv().catch((e) => setMessage(e.message))}
          className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
        >
          Export CSV
        </button>
      </div>
      {message && <p className="mb-2 text-xs text-red-600">{message}</p>}
      <div className="space-y-2">
        {rows.map((f) => (
          <div key={f.id} className="rounded-md border border-gray-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                f.category === 'bug' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
              }`}>{f.category}</span>
              <span className="text-xs text-gray-500">{f.severity}</span>
              {f.rating != null && <span className="text-xs text-amber-600">{'★'.repeat(f.rating)}</span>}
              <span className="text-xs text-gray-500">{f.user_email}</span>
              <span className="text-xs text-gray-400">{new Date(f.created_at).toLocaleString()}</span>
              <span className="ml-auto flex gap-1 text-xs">
                {(['new', 'reviewed', 'resolved'] as const).map((s) => (
                  <button
                    key={s} type="button" onClick={() => void setRowStatus(f.id, s)}
                    className={`rounded px-1.5 py-0.5 cursor-pointer ${f.status === s ? 'bg-[#003566] text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    {s}
                  </button>
                ))}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-gray-800">{f.message}</p>
            <div className="mt-1 flex gap-3 text-xs">
              {f.screenshot_url && (
                <a href={f.screenshot_url} target="_blank" rel="noreferrer" className="text-[#289693] hover:underline">
                  screenshot
                </a>
              )}
              {f.context && (
                <button type="button" onClick={() => setOpenId(openId === f.id ? null : f.id)} className="text-gray-500 hover:underline cursor-pointer">
                  {openId === f.id ? 'hide context' : 'context'}
                </button>
              )}
            </div>
            {openId === f.id && f.context && (
              <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-[11px]">
                {typeof f.context === 'string' ? f.context : JSON.stringify(f.context, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {!rows.length && <p className="text-sm text-gray-500">No feedback yet.</p>}
      </div>
    </section>
  );
}
