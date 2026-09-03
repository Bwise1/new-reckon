import { Check, MessageCircle } from 'lucide-react';

/**
 * The small comment button on an element header or item card — ported from
 * the prototype. A count badge while the thread is open; a check in a muted
 * ring once it is resolved.
 */
export default function CommentTrigger({
  count,
  resolved,
  label,
  onOpen,
}: {
  count: number;
  resolved: boolean;
  label: string;
  onOpen: (rect: DOMRect) => void;
}) {
  const hasActivity = count > 0;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(e.currentTarget.getBoundingClientRect());
      }}
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
        resolved
          ? 'text-muted hover:bg-surface-muted hover:text-muted'
          : hasActivity
            ? 'text-body hover:bg-overlay/10'
            : 'text-muted hover:bg-surface-muted hover:text-body'
      }`}
    >
      <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
      {hasActivity && !resolved && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-body px-[3px] text-[9px] font-semibold leading-none text-canvas">
          {count}
        </span>
      )}
      {hasActivity && resolved && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-overlay/15 text-muted">
          <Check className="h-2 w-2" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
