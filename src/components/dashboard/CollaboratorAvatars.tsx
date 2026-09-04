import { avatarColor } from '@/lib/avatar';

type Person = { id: number | string; name: string; initials: string; avatarUrl?: string | null };

/** Stacked initials for a project's people — the prototype's component. */
export default function CollaboratorAvatars({ people, max = 3 }: { people: Person[]; max?: number }) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;
  return (
    <div className="flex -space-x-2">
      {visible.map((p) =>
        p.avatarUrl ? (
          <img
            key={p.id}
            src={p.avatarUrl}
            alt=""
            title={p.name}
            className="h-6 w-6 shrink-0 rounded-full object-cover ring-2 ring-surface"
          />
        ) : (
          <span
            key={p.id}
            title={p.name}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-surface ${avatarColor(p.name)}`}
          >
            {p.initials}
          </span>
        )
      )}
      {overflow > 0 && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-muted ring-2 ring-surface">
          +{overflow}
        </span>
      )}
    </div>
  );
}
