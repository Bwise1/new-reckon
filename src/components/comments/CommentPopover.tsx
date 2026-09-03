import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, MessageCircle, Trash2, X } from 'lucide-react';
import { splitMentions, type CommentEntry, type CommentMember } from '@/types/comments';
import MentionInput from './MentionInput';

export const COMMENT_POPOVER_WIDTH = 340;
export const COMMENT_POPOVER_HEIGHT = 420;

type Props = {
  title: string;
  comments: CommentEntry[];
  resolved: boolean;
  /** The trigger's bounding rect; the popover opens beside it, kept on screen. */
  anchorRect: DOMRect;
  portalTheme: string;
  currentUserId: number | null;
  members: CommentMember[];
  onClose: () => void;
  onResolve: () => void;
  onSend: (message: string, mentions: number[]) => void;
  onDelete: (clientUuid: string) => void;
};

const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(iso).toLocaleDateString();
};

/**
 * The thread popover — ported from the prototype's CommentPopover: header with
 * the target's title and Resolve/Reopen, the thread of avatar-initials +
 * author + time + bubble, and a composer. Fixed-position, portalled with the
 * app theme so it renders above the sidebar.
 */
export default function CommentPopover({
  title,
  comments,
  resolved,
  anchorRect,
  portalTheme,
  currentUserId,
  members,
  onClose,
  onResolve,
  onSend,
  onDelete,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Open to the left of the trigger (the sidebar is on the right edge), and
  // clamp so the popover never leaves the viewport.
  const margin = 8;
  const left = Math.max(
    margin,
    Math.min(anchorRect.left - COMMENT_POPOVER_WIDTH - margin, window.innerWidth - COMMENT_POPOVER_WIDTH - margin)
  );
  const top = Math.max(
    margin,
    Math.min(anchorRect.top - 12, window.innerHeight - COMMENT_POPOVER_HEIGHT - margin)
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [comments.length]);


  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-theme={portalTheme}
      style={{ top, left, width: COMMENT_POPOVER_WIDTH, height: COMMENT_POPOVER_HEIGHT }}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl text-body"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-body">{title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {resolved ? 'Resolved' : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {comments.length > 0 && (
            <button
              type="button"
              onClick={onResolve}
              className={`flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                resolved
                  ? 'border-border bg-surface-muted text-muted hover:bg-surface-muted'
                  : 'border-overlay/20 bg-overlay/10 text-body hover:bg-overlay/15'
              }`}
            >
              <Check className="h-3 w-3" strokeWidth={2.5} />
              {resolved ? 'Reopen' : 'Resolve Thread'}
            </button>
          )}
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-body cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {comments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageCircle className="h-6 w-6 text-muted" strokeWidth={1.5} />
            <p className="text-xs text-muted">No comments yet. Start the discussion.</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.clientUuid} className="group flex items-start gap-2.5">
              {comment.author.avatarUrl ? (
                <img
                  src={comment.author.avatarUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-overlay/10 text-[10px] font-semibold text-body">
                  {comment.author.initials}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-body">{comment.author.name}</span>
                  <span className="text-[10px] text-muted">
                    {comment.pending ? 'sending…' : relativeTime(comment.createdAt)}
                  </span>
                  {currentUserId === comment.author.id && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      title="Delete"
                      onClick={() => onDelete(comment.clientUuid)}
                      className="ml-auto flex h-5 w-5 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words rounded-lg rounded-tl-sm bg-surface-muted px-2.5 py-1.5 text-xs text-body">
                  {splitMentions(comment.body).map((part, i) =>
                    part.type === 'mention' ? (
                      <span
                        key={i}
                        className={`rounded px-1 font-medium ${
                          part.userId === currentUserId ? 'bg-accent/15 text-accent' : 'bg-overlay/10 text-body'
                        }`}
                      >
                        {part.text}
                      </span>
                    ) : (
                      <span key={i}>{part.text}</span>
                    )
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border px-3 py-2.5">
        <MentionInput
          members={members}
          autoFocus
          placeholder={
            comments.length === 0 ? 'Add a comment… @ to mention, Enter to post' : 'Type a reply… @ to mention, Enter to post'
          }
          onSubmit={onSend}
        />
      </div>
    </div>,
    document.body
  );
}
