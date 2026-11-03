'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'layerum:theme';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
  hydrated: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
      } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
        setThemeState('light');
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: ThemeMode = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-app-theme', theme);
    document.documentElement.setAttribute('data-app-theme', theme);
    document.documentElement.setAttribute('data-public-theme', theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, hydrated }),
    [theme, setTheme, toggleTheme, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return value;
}
