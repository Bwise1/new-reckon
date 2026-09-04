import { Building2, GraduationCap, User } from 'lucide-react';

type Kind = 'personal' | 'organization' | 'educational';

/** Per-workspace-kind glyph. Ported from the prototype. */
export function WorkspaceKindIcon({ kind, className = 'h-3.5 w-3.5' }: { kind: Kind; className?: string }) {
  if (kind === 'organization') return <Building2 className={className} />;
  if (kind === 'educational') return <GraduationCap className={className} />;
  return <User className={className} />;
}

export const WORKSPACE_KIND_LABELS: Record<Kind, string> = {
  personal: 'Personal',
  organization: 'Organization',
  educational: 'Educational',
};
