/**
 * Identity avatars are neutral — no per-user colour hashing and no brand
 * accent (that is reserved for CTAs and active states). Ported from the
 * Reckon-Bill prototype.
 */
export function avatarColor(_identifier?: string) {
  return 'bg-overlay/10 text-body';
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}
