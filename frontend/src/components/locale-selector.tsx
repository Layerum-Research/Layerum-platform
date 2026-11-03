'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_NATIVE_LABELS } from '@/i18n/locale-labels';
import { routing, type AppLocale } from '@/i18n/routing';
import styles from './locale-selector.module.css';

function isAppLocale(value: string): value is AppLocale {
  return routing.locales.includes(value as AppLocale);
}

export function LocaleSelector({
  label,
  ariaLabel,
  className,
}: {
  label?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>(undefined);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(undefined);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const gap = 8;
      const offset = 8;
      const triggerRect = trigger.getBoundingClientRect();
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;

      let left = triggerRect.right - menuWidth;
      left = Math.max(gap, Math.min(left, window.innerWidth - menuWidth - gap));

      let top = triggerRect.top - menuHeight - offset;
      if (top < gap) {
        top = triggerRect.bottom + offset;
      }
      top = Math.max(gap, Math.min(top, window.innerHeight - menuHeight - gap));

      setMenuStyle({
        position: 'fixed',
        bottom: 'auto',
        right: 'auto',
        left,
        top,
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, locale, pathname]);

  function switchLocale(nextLocale: AppLocale) {
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className={`${styles.root}${className ? ` ${className}` : ''}`} ref={rootRef}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <button
        aria-label={ariaLabel ?? label ?? 'Select language'}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={styles.trigger}
        ref={triggerRef}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <span className={styles.value}>{LOCALE_NATIVE_LABELS[locale as AppLocale]}</span>
        <ChevronDown className={`${styles.chevron}${open ? ` ${styles.chevronOpen}` : ''}`} size={14} />
      </button>
      {open ? (
        <div className={styles.menu} ref={menuRef} role="listbox" style={menuStyle}>
          {routing.locales.map((item) => {
            const selected = item === locale;
            return (
              <button
                aria-selected={selected}
                className={`${styles.option}${selected ? ` ${styles.optionActive}` : ''}`}
                key={item}
                onClick={() => {
                  if (item === locale) {
                    setOpen(false);
                    return;
                  }
                  switchLocale(item);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                <span>{LOCALE_NATIVE_LABELS[item]}</span>
                {selected ? <Check size={12} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <select
        aria-hidden="true"
        className={styles.nativeFallback}
        onChange={(event) => {
          const nextLocale = event.target.value;
          if (!isAppLocale(nextLocale)) return;
          switchLocale(nextLocale);
        }}
        tabIndex={-1}
        value={locale}
      >
        {routing.locales.map((item) => (
          <option key={item} value={item}>
            {LOCALE_NATIVE_LABELS[item]}
          </option>
        ))}
      </select>
    </div>
  );
}
