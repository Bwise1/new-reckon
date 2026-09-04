import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { GraduationCap, X } from 'lucide-react';
import { useTheme } from '@/hooks/useProjectTheme';
import type { EducationPayload } from '@/services/accounts.service';

const INSTITUTION_TYPES = ['University', 'Polytechnic', 'College of Education', 'Technical College', 'Other'] as const;
const COURSE_LEVELS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', 'Postgraduate', 'Staff'] as const;

const fieldClass =
  'mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 transition';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted';

type Props = {
  open: boolean;
  pending?: boolean;
  onClose: () => void;
  /** name is the course code; education carries the rest. */
  onSubmit: (name: string, education: EducationPayload) => void;
};

/** Create Educational Hub — ported from the prototype, wired to the accounts service. */
export default function CreateEducationalModal({ open, pending, onClose, onSubmit }: Props) {
  const { theme } = useTheme();
  const [institutionName, setInstitutionName] = useState('');
  const [institutionType, setInstitutionType] = useState<string>(INSTITUTION_TYPES[0]);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [level, setLevel] = useState<string>(COURSE_LEVELS[0]);

  if (!open) return null;

  const canSubmit = !!institutionName.trim() && !!courseTitle.trim() && !!courseCode.trim() && !pending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(courseCode.trim(), {
      institutionName: institutionName.trim(),
      institutionType,
      courseTitle: courseTitle.trim(),
      courseCode: courseCode.trim(),
      level,
    });
  };

  return createPortal(
    <div data-theme={theme} className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Create Educational Hub"
        className="w-full max-w-md rounded-xl border border-border bg-surface text-body shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-body">
            <GraduationCap className="h-4 w-4 text-muted" />
            Create Educational Hub
          </h2>
          <button type="button" aria-label="Close" onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-5 py-5">
            <p className="text-xs text-muted">
              A shared space for a single course. Students and lecturers run takeoffs for coursework,
              research, or teaching — you’ll be the owner and can invite classmates or staff later.
            </p>

            <div>
              <label className={labelClass}>Institution Name</label>
              <input autoFocus required value={institutionName} onChange={(e) => setInstitutionName(e.target.value)}
                placeholder="University of Lagos" className={fieldClass} />
            </div>

            <div>
              <label className={labelClass}>Institution Type</label>
              <select value={institutionType} onChange={(e) => setInstitutionType(e.target.value)} className={fieldClass}>
                {INSTITUTION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>

            <div>
              <label className={labelClass}>Course Title</label>
              <input required value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)}
                placeholder="Building Measurement & Estimating" className={fieldClass} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Course Code</label>
                <input required value={courseCode} onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="QNS 312" className={fieldClass} />
                <p className="mt-1 text-[11px] text-muted">Used as the hub name.</p>
              </div>
              <div>
                <label className={labelClass}>Level</label>
                <select value={level} onChange={(e) => setLevel(e.target.value)} className={fieldClass}>
                  {COURSE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40">
              {pending ? 'Creating…' : 'Create Hub'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
