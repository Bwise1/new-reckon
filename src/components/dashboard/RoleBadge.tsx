import type { OrgSummary } from '@/services/accounts.service';

/** One accent-tinted style for the highest role, neutral for the rest — the
 *  prototype's RoleBadge (no per-role colour coding). */
type Role = OrgSummary['role'];
const LABELS: Record<Role, string> = { owner: 'Owner', admin: 'Administrator', member: 'Member', guest: 'Guest' };
const CLASS: Record<Role, string> = {
  owner: 'bg-overlay/12 text-body',
  admin: 'bg-overlay/8 text-body',
  member: 'bg-overlay/8 text-muted',
  guest: 'bg-overlay/8 text-muted',
};

export default function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASS[role]}`}>
      {LABELS[role]}
    </span>
  );
}
