import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useProjectTheme';

const DEFAULT_CLASS =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-overlay/10 hover:text-body cursor-pointer';

/** Quick light/dark flip (the prototype's). Settings › Appearance also offers "System". */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
      className={className ?? DEFAULT_CLASS}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
