import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; location: string }) => void;
  /** Edit mode: pre-fill fields and switch labels to "Save changes". */
  mode?: 'create' | 'edit';
  initialTitle?: string;
  initialLocation?: string;
}

const fieldClass =
  'mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-body outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20 transition';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted';

/** The prototype's New Project dialog, with our edit mode kept. */
const NewProjectModal = ({
  isOpen,
  isPending,
  onClose,
  onCreate,
  mode = 'create',
  initialTitle = '',
  initialLocation = '',
}: NewProjectModalProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [location, setLocation] = useState(initialLocation);

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setLocation(initialLocation);
    }
  }, [isOpen, initialTitle, initialLocation]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const isEdit = mode === 'edit';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isPending) return;
    onCreate({ title: title.trim(), location: location.trim() });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/50 px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit Project' : 'New Project'}
        className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-body">{isEdit ? 'Edit Project' : 'New Project'}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-body cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-5 py-5">
            <div>
              <label className={labelClass}>Project Title</label>
              <input
                autoFocus
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Lekki Waterfront Residences"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Location</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Lekki, Lagos"
                className={fieldClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-muted hover:text-body cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
            >
              {isPending ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewProjectModal;
