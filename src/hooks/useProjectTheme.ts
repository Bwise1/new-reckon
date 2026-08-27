import { useEffect, useState } from 'react';

export type ProjectTheme = 'dark' | 'light';

const KEY = 'reckon_project_theme';
const EVENT = 'reckon:project-theme';

const read = (): ProjectTheme => {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

/**
 * The project shell's theme (dark is the default, per the Reckon-Bill
 * prototype). Persisted, and broadcast so every consumer — the shell, the
 * toggle button, portaled menus — flips together without prop-drilling.
 */
export function useProjectTheme() {
  const [theme, setTheme] = useState<ProjectTheme>(read);

  useEffect(() => {
    const onChange = (e: Event) => {
      setTheme((e as CustomEvent<ProjectTheme>).detail);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const toggle = () => {
    const next: ProjectTheme = read() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage failures just lose persistence
    }
    window.dispatchEvent(new CustomEvent<ProjectTheme>(EVENT, { detail: next }));
  };

  return { theme, toggle };
}
