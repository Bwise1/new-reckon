import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';

/** Auto-captured client context — makes reports actionable without asking
 *  testers for any of it. */
const buildContext = (route: string) => ({
  route,
  version: import.meta.env.VITE_APP_VERSION ?? 'dev',
  userAgent: navigator.userAgent,
  screen: `${window.screen.width}x${window.screen.height}`,
  viewport: `${window.innerWidth}x${window.innerHeight}`,
  timestamp: new Date().toISOString(),
});

/**
 * Floating beta-feedback button. Rendered only when a user session exists.
 * Retries the submit once on network failure before surfacing an error.
 */
export default function FeedbackWidget() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('bug');
  const [severity, setSeverity] = useState('medium');
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // This button is app-wide, but the takeoff view puts a 380px BOQ sidebar in
  // the bottom-right corner — anchored there, the pill covered each card's
  // duplicate/delete row. Shift clear of both that column and the canvas zoom
  // controls when the sidebar is mounted; keep the normal corner placement
  // everywhere else (dashboard, settings), where the corner is empty.
  const [clearsSidebar, setClearsSidebar] = useState(false);
  useEffect(() => {
    const check = () =>
      setClearsSidebar(!!document.querySelector('[data-boq-sidebar]'));
    check();
    // This widget is a sibling of the router outlet, so on a route change it
    // re-renders BEFORE the takeoff page mounts — checking only on pathname
    // ran while the sidebar didn't exist yet and the pill never moved. Watch
    // the tree instead so it reacts whenever the sidebar appears or goes away.
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Only show for logged-in users; hide on the admin page.
  if (!localStorage.getItem('token')) return null;
  if (location.pathname.startsWith('/admin')) return null;

  const reset = () => {
    setCategory('bug'); setSeverity('medium'); setRating(0);
    setText(''); setFile(null); setNote('');
  };

  const submitOnce = async () => {
    const form = new FormData();
    form.append('category', category);
    form.append('severity', severity);
    form.append('message', text.trim());
    if (rating > 0) form.append('rating', String(rating));
    form.append('context', JSON.stringify(buildContext(location.pathname)));
    if (file) form.append('screenshot', file);
    // postForm goes through the shared client: X-Request-Source, the user
    // bearer token, and multipart boundary handling all come for free.
    await apiClient.postForm('/feedback', form);
  };

  const submit = async () => {
    if (!text.trim()) { setNote('Please describe the issue or idea.'); return; }
    setBusy(true);
    setNote('');
    try {
      try {
        await submitOnce();
      } catch (first) {
        // One silent retry for flaky connections. A 4xx (validation, rate
        // limit, auth) won't succeed on retry, so surface it immediately.
        const status = (first as { status?: number }).status;
        if (status && status >= 400 && status < 500) throw first;
        await submitOnce();
      }
      reset();
      setOpen(false);
      setNote('');
      window.setTimeout(() => setNote(''), 0);
      alert('Thank you! Your feedback has been recorded.');
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-4 ${
          clearsSidebar ? 'right-[506px]' : 'right-4'
        } z-[9000] rounded-full bg-[#003566] px-4 py-2.5 text-sm font-semibold text-white shadow-xl hover:bg-[#002847] cursor-pointer`}
      >
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-[9500] flex items-end justify-end bg-black/20 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-xl bg-white p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900">Send feedback</h3>
            <div className="flex gap-1.5">
              {['bug', 'idea', 'usability', 'other'].map((c) => (
                <button
                  key={c} type="button" onClick={() => setCategory(c)}
                  className={`rounded-full px-3 py-1 text-xs capitalize cursor-pointer ${category === c ? 'bg-[#003566] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <label className="flex items-center gap-1.5">
                Severity
                <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded border border-gray-300 px-1.5 py-1">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <span className="flex items-center gap-0.5">
                Rating
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)}
                    className={`cursor-pointer text-base ${n <= rating ? 'text-amber-500' : 'text-gray-300'}`}
                  >
                    ★
                  </button>
                ))}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="What happened? What did you expect?"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#289693]"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="cursor-pointer text-gray-600 hover:text-gray-900">
                {file ? `📎 ${file.name}` : '📎 Attach screenshot'}
                <input
                  type="file" accept="image/png,image/jpeg" className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 text-gray-500 hover:bg-gray-100 cursor-pointer">
                  Cancel
                </button>
                <button
                  type="button" onClick={() => void submit()} disabled={busy}
                  className="rounded-md bg-[#289693] px-4 py-1.5 font-semibold text-white hover:bg-[#1f7a77] disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
            {note && <p className="text-xs text-red-600">{note}</p>}
          </div>
        </div>
      )}
    </>
  );
}
