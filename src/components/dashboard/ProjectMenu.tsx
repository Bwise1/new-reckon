import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
const MENU_WIDTH = 176; // w-44

export default function ProjectMenu({ onDuplicate, onRename, onDelete, onShare, canManage = true }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Portal the menu to the body, positioned to the button, flipping above
  // when short on room below. This escapes the list/card container's
  // overflow-hidden, which otherwise clipped the last row's menu.
  const openMenu = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      const items = 1 + (onShare ? 1 : 0) + (canManage ? 2 : 0);
      const estHeight = items * 38 + 8;
      const below = window.innerHeight - r.bottom;
      const top = below < estHeight ? r.top - estHeight - 4 : r.bottom + 4;
      setPos({ top, left: Math.max(8, r.right - MENU_WIDTH) });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Project options"
        onClick={(e) => {
          e.stopPropagation();
          open ? setOpen(false) : openMenu();
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-overlay/10 hover:text-body group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_WIDTH, zIndex: 99999 }}
            className="rounded-lg border border-border bg-surface py-1 shadow-lg"
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
          </div>,
          document.body,
      )}
    </div>
  );
}
