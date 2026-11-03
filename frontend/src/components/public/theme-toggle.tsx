'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/providers/theme-provider';
import styles from '../public-site-header.module.css';

export function PublicThemeToggle({ label }: { label: string }) {
  const { theme, toggleTheme, hydrated } = useTheme();
  const isLight = theme === 'light';
  return (
    <button
      type="button"
      className={styles.themeToggle}
      onClick={toggleTheme}
      aria-pressed={isLight}
      aria-label={label}
      title={label}
      suppressHydrationWarning
    >
      <span className={styles.themeThumb} data-light={isLight || undefined}>
        {hydrated && isLight ? <Sun size={14} /> : <Moon size={14} />}
      </span>
    </button>
  );
}
