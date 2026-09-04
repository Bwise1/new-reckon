import { NavLink } from 'react-router-dom';
import { Building2, CreditCard, ShieldCheck, User, Users } from 'lucide-react';

const TABS = [
  { to: '/settings/general', label: 'General & Branding', icon: Building2 },
  { to: '/settings/billing', label: 'Billing & Plans', icon: CreditCard },
  { to: '/settings/team', label: 'Team', icon: Users },
  { to: '/settings/security', label: 'Security & Account', icon: ShieldCheck },
  { to: '/settings/account', label: 'Your Account', icon: User },
];

/** The settings tab rail — ported from the prototype's SettingsNav. */
export default function SettingsNav() {
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-56 md:flex-col md:overflow-visible">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-overlay/10 text-body'
                : 'text-muted hover:bg-overlay/5 hover:text-body'
            }`
          }
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
