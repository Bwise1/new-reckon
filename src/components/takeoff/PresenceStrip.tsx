import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { PRESENCE_STRIP_MAX, REALTIME_ENABLED } from "@/realtime/config";
import type { Presence } from "@/realtime/types";
import { useRealtimeStore } from "@/store/useRealtimeStore";
import { ROLE_LABELS } from "@/types/members";

/**
 * Who is in the project right now — top-right of the canvas. Up to
 * PRESENCE_STRIP_MAX avatars (ring in each person's colour; "you" gets none),
 * then a "+N" button that opens the full list. Picking a person follows
 * them: jump to their page and centre their cursor.
 */

interface PresenceStripProps {
  onFollow: (member: Presence) => void;
}

const Avatar: React.FC<{ member: Presence; isSelf: boolean; size?: number }> = ({
  member,
  isSelf,
  size = 28,
}) => (
  <span
    className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-[11px] font-semibold text-body"
    style={{
      width: size,
      height: size,
      boxShadow: isSelf ? "0 0 0 2px var(--color-surface)" : `0 0 0 2px ${member.color}`,
    }}
    aria-hidden
  >
    {member.avatarUrl ? (
      <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
    ) : (
      member.initials || "?"
    )}
  </span>
);

const PresenceStrip: React.FC<PresenceStripProps> = ({ onFollow }) => {
  const members = useRealtimeStore((s) => s.members);
  const self = useRealtimeStore((s) => s.self);
  const connected = useRealtimeStore((s) => s.connected);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const hoverCapable =
    typeof window !== "undefined" && window.matchMedia?.("(hover: hover)").matches;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        buttonRef.current?.focus();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  if (!REALTIME_ENABLED) return null;

  // Others first (they are the point of the strip), me last.
  const ordered = [
    ...members.filter((m) => m.userId !== self?.userId),
    ...members.filter((m) => m.userId === self?.userId),
  ];
  const visible = ordered.slice(0, PRESENCE_STRIP_MAX);
  const overflow = ordered.length - visible.length;

  return (
    <div
      ref={wrapperRef}
      className="absolute right-3 top-3 z-30 flex items-center gap-2"
      onMouseEnter={hoverCapable ? () => setOpen(true) : undefined}
      onMouseLeave={hoverCapable ? close : undefined}
    >
      {!connected && (
        <span
          className="flex items-center gap-1.5 rounded-full bg-surface/90 px-2 py-1 text-[11px] font-medium text-muted shadow"
          role="status"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" aria-hidden />
          offline — reconnecting…
        </span>
      )}

      {ordered.length > 0 && (
        <div className="flex items-center rounded-full bg-surface/90 p-1 shadow">
          <div className="flex items-center -space-x-1.5" aria-label="People in this project">
            {visible.map((m) => (
              <span
                key={m.userId}
                title={m.userId === self?.userId ? `${m.name} (you)` : `${m.name} · page ${m.page}`}
                className="inline-flex rounded-full"
              >
                <Avatar member={m} isSelf={m.userId === self?.userId} />
              </span>
            ))}
          </div>
          <button
            ref={buttonRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={popoverId}
            aria-label={overflow > 0 ? `${overflow} more people` : "Show everyone in this project"}
            onClick={() => setOpen((v) => !v)}
            className="ml-1.5 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-overlay/10 px-1.5 text-[11px] font-semibold text-body hover:bg-overlay/20 focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
          >
            {overflow > 0 ? `+${overflow}` : "…"}
          </button>
        </div>
      )}

      {open && ordered.length > 0 && (
        <div
          id={popoverId}
          role="menu"
          className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl"
        >
          {ordered.map((m) => {
            const isSelf = m.userId === self?.userId;
            return (
              <button
                key={m.userId}
                type="button"
                role="menuitem"
                disabled={isSelf}
                onClick={() => {
                  onFollow(m);
                  close();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-overlay/10 disabled:cursor-default disabled:hover:bg-transparent cursor-pointer"
              >
                <Avatar member={m} isSelf={isSelf} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-body">
                    {m.name}
                    {isSelf ? " (you)" : ""}
                  </span>
                  <span className="block truncate text-[11px] text-muted">
                    {ROLE_LABELS[m.role] ?? m.role} · page {m.page}
                  </span>
                </span>
                {!isSelf && <span className="text-[11px] text-muted">follow</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PresenceStrip;
