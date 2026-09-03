import { useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { CommentMember } from '@/types/comments';

/**
 * The comment composer with @mentions. Typing `@` opens a picker over the
 * people who can see the project; choosing one inserts `@Name` into the
 * text. On submit the visible `@Name`s become stored tokens
 * `@[Name](u:id)` and the ids are sent as `mentions`.
 */
export default function MentionInput({
  members,
  placeholder,
  onSubmit,
  autoFocus,
}: {
  members: CommentMember[];
  placeholder: string;
  onSubmit: (body: string, mentions: number[]) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [selected, setSelected] = useState<CommentMember[]>([]);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // The `@query` being typed, if the caret sits inside one.
  const mentionQuery = useMemo(() => {
    const before = draft.slice(0, caret);
    const m = before.match(/(?:^|\s)@([^\s@]*)$/);
    return m ? { query: m[1], start: before.length - m[1].length - 1 } : null;
  }, [draft, caret]);

  const suggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [members, mentionQuery]);

  useEffect(() => setActive(0), [suggestions.length, mentionQuery?.query]);

  const choose = (member: CommentMember) => {
    if (!mentionQuery) return;
    const insert = `@${member.name} `;
    const next = draft.slice(0, mentionQuery.start) + insert + draft.slice(caret);
    setDraft(next);
    setSelected((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
    const pos = mentionQuery.start + insert.length;
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
      inputRef.current?.focus();
    });
  };

  const submit = () => {
    let body = draft.trim();
    if (!body) return;
    const mentions: number[] = [];
    // Only mentions whose `@Name` survived editing count.
    for (const m of selected) {
      const visible = `@${m.name}`;
      if (body.includes(visible)) {
        body = body.split(visible).join(`@[${m.name}](u:${m.id})`);
        mentions.push(m.id);
      }
    }
    onSubmit(body, mentions);
    setDraft('');
    setSelected([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionQuery && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => (a + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        choose(suggestions[active]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const showPicker = mentionQuery !== null;

  return (
    <div className="relative">
      {showPicker && (
        <div className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {suggestions.length > 0 ? (
            suggestions.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  i === active ? 'bg-overlay/10 text-body' : 'text-body hover:bg-overlay/5'
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-overlay/10 text-[9px] font-semibold">
                  {m.initials}
                </span>
                <span className="truncate">{m.name}</span>
              </button>
            ))
          ) : (
            <p className="px-2.5 py-2 text-[11px] text-muted">
              {members.length <= 1
                ? 'Only you can see this project — invite people to mention them.'
                : 'No one matches.'}
            </p>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-xs text-body outline-none placeholder:text-muted"
        />
        <button
          type="button"
          aria-label="Send comment"
          onClick={submit}
          disabled={!draft.trim()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-body transition-colors hover:bg-overlay/10 disabled:text-muted disabled:hover:bg-transparent cursor-pointer"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
