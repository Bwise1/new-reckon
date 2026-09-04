import { useState } from 'react';
import { Copy, MoreHorizontal, Pencil, Trash2, Users } from 'lucide-react';

type Props = {
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** Present when the caller may manage people on this project. */
  onShare?: () => void;
  /** Hide destructive items for projects the caller does not own/administer. */
  canManage?: boolean;
};

/**
 * The card/row overflow menu. Share and Archive from the prototype arrive
 * with project sharing; Rename is ours (the prototype edits in settings).
 */
export default function ProjectMenu({ onDuplicate, onRename, onDelete, onShare, canManage = true }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Project options"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-overlay/10 hover:text-body group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDuplicate();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </button>
            {onShare && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onShare();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer"
              >
                <Users className="h-3.5 w-3.5" />
                Share…
              </button>
            )}
            {canManage && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRename();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-body transition-colors hover:bg-overlay/5 cursor-pointer"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            )}
            {canManage && <div className="my-1 h-px bg-surface-muted" />}
            {canManage && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
