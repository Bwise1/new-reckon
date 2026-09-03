import { useEffect, useState } from 'react';

/**
 * App-wide theme. The person chooses Light, Dark or System (Settings ›
 * Appearance); the resolved theme is written as `data-theme` on <html>, so
 * every page — dashboard, settings, sign-in, the takeoff shell — follows
 * the same choice, as in the Reckon-Bill prototype.
 *
 * "System" tracks the OS preference live. The choice is persisted and
 * broadcast so every consumer flips together without prop-drilling.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ProjectTheme = 'dark' | 'light';

const KEY = 'reckon_theme';
const LEGACY_KEY = 'reckon_project_theme';
const EVENT = 'reckon:theme';
const MEDIA = '(prefers-color-scheme: dark)';

const readPreference = (): ThemePreference => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
    // Carry over the old takeoff-only preference once.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === 'light' || legacy === 'dark') {
      localStorage.setItem(KEY, legacy);
      return legacy;
    }
  } catch {
    /* storage unavailable */
  }
  // Default: dark, matching the prototype and the takeoff shell's look.
  return 'dark';
};

const systemTheme = (): ProjectTheme =>
  typeof window !== 'undefined' && window.matchMedia?.(MEDIA).matches ? 'dark' : 'light';

export const resolveTheme = (pref: ThemePreference): ProjectTheme =>
  pref === 'system' ? systemTheme() : pref;

/** Write the resolved theme onto <html>. Called before first paint too. */
export const applyTheme = (pref: ThemePreference = readPreference()) => {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  return resolved;
};

export const setThemePreference = (pref: ThemePreference) => {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* storage failures just lose persistence */
  }
  applyTheme(pref);
  window.dispatchEvent(new CustomEvent<ThemePreference>(EVENT, { detail: pref }));
};

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [theme, setTheme] = useState<ProjectTheme>(() => resolveTheme(readPreference()));

  useEffect(() => {
    const onChange = (e: Event) => {
      const pref = (e as CustomEvent<ThemePreference>).detail;
      setPreferenceState(pref);
      setTheme(resolveTheme(pref));
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  // Follow the OS while on "system".
  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia(MEDIA);
    const onMedia = () => setTheme(applyTheme('system'));
    mq.addEventListener('change', onMedia);
    return () => mq.removeEventListener('change', onMedia);
  }, [preference]);

  const toggle = () => setThemePreference(theme === 'dark' ? 'light' : 'dark');

  return { preference, setPreference: setThemePreference, theme, toggle };
}

/** The takeoff shell's existing hook name — same app-wide theme underneath. */
export function useProjectTheme() {
  const { theme, toggle } = useTheme();
  return { theme, toggle };
}
