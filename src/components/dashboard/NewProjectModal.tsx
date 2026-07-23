import { useState } from "react";
import { FiX } from "react-icons/fi";

interface NewProjectModalProps {
  isOpen: boolean;
  isPending: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; location: string; file?: File }) => void;
}

const NewProjectModal = ({ isOpen, isPending, onClose, onCreate }: NewProjectModalProps) => {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), location: location.trim() });
  };

  const handleClose = () => {
    setTitle("");
    setLocation("");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">New Project</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
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
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-400"
          />

          <input
            type="text"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-400"
          />

        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={handleClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isPending}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewProjectModal;
