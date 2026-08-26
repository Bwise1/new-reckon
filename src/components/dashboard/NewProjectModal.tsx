import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";

interface NewProjectModalProps {
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; location: string; file?: File }) => void;
  /** Edit mode: pre-fill fields and switch labels to "Save changes". */
  mode?: "create" | "edit";
  initialTitle?: string;
  initialLocation?: string;
}

const NewProjectModal = ({
  isOpen,
  isPending,
  onClose,
  onCreate,
  mode = "create",
  initialTitle = "",
  initialLocation = "",
}: NewProjectModalProps) => {
  const [title, setTitle] = useState(initialTitle);
  const [location, setLocation] = useState(initialLocation);

  // Re-seed when the modal opens (so editing a different project shows its
  // current values rather than stale ones).
  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setLocation(initialLocation);
    }
  }, [isOpen, initialTitle, initialLocation]);

  if (!isOpen) return null;

  const isEdit = mode === "edit";

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), location: location.trim() });
  };

  const handleClose = () => {
    setTitle(initialTitle);
    setLocation(initialLocation);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-body">
            {isEdit ? "Edit Project" : "New Project"}
          </h2>
          <button onClick={handleClose} className="text-muted/70 hover:text-body transition-colors">
            <FiX className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full px-3 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:border-muted/60 placeholder-muted/70"
          />

          <input
            type="text"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full px-3 py-2.5 text-sm border border-border rounded-lg focus:outline-none focus:border-muted/60 placeholder-muted/70"
          />

        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 text-sm font-medium text-muted bg-surface-muted rounded-lg hover:bg-overlay/15 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isPending}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isPending
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewProjectModal;
