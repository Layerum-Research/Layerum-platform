'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUpDown } from 'lucide-react';

type SelectOption = {
  value: string;
  label: string;
};

type MenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const MENU_MAX_HEIGHT = 220;
const MENU_GAP = 4;
const VIEWPORT_MARGIN = 8;

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  placement?: 'auto' | 'bottom';
};

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  emptyLabel = 'No options',
  className,
  disabled = false,
  id,
  placement = 'auto',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  useEffect(() => {
    if (!open) return;

    function syncMenuPosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN;
      const openUp =
        placement === 'auto' && spaceBelow < MENU_MAX_HEIGHT && spaceAbove > spaceBelow;

      setMenuPosition(
        openUp
          ? {
              left: rect.left,
              width: rect.width,
              bottom: viewportHeight - rect.top + MENU_GAP,
              maxHeight: Math.min(MENU_MAX_HEIGHT, spaceAbove),
            }
          : {
              left: rect.left,
              width: rect.width,
              top: rect.bottom + MENU_GAP,
              maxHeight: Math.min(MENU_MAX_HEIGHT, viewportHeight - 2 * VIEWPORT_MARGIN),
            },
      );
    }

    syncMenuPosition();
    window.addEventListener('resize', syncMenuPosition);
    window.addEventListener('scroll', syncMenuPosition, true);
    return () => {
      window.removeEventListener('resize', syncMenuPosition);
      window.removeEventListener('scroll', syncMenuPosition, true);
    };
  }, [open, placement]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current) return;
      if (rootRef.current.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    function onBlur(event: FocusEvent) {
      const target = event.relatedTarget as Node | null;
      if (rootRef.current?.contains(target ?? null)) return;
      if (menuRef.current?.contains(target ?? null)) return;
      if (target === null) {
        setOpen(false);
      }
    }

    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEscape);
    window.addEventListener('focusout', onBlur);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEscape);
      window.removeEventListener('focusout', onBlur);
    };
  }, []);

  return (
    <div className={`layerum-select-root ${className ?? ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        id={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="layerum-select layerum-select-trigger"
        disabled={disabled}
        onClick={(event) => {
          // Keep trigger clicks from reaching overlay handlers (e.g. modal
          // backdrop) when the select is used inside popups.
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        type="button"
      >
        <span className={selected ? '' : 'layerum-muted'}>{selected?.label ?? placeholder}</span>
        <ChevronsUpDown className="layerum-select-chevron" size={14} />
      </button>

      {open && menuPosition
        ? createPortal(
            <div
              className="layerum-select-menu layerum-select-menu-portal"
              role="listbox"
              ref={menuRef}
              // Portal menu lives outside ancestor popups in the DOM, so stop
              // native + synthetic events here. Otherwise option clicks can
              // fall through to overlay handlers (e.g. modal backdrop click
              // closes the whole modal). Own outside-close is
              // containment-based, so it is unaffected.
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              style={{
                left: menuPosition.left,
                top: menuPosition.top ?? 'auto',
                bottom: menuPosition.bottom ?? 'auto',
                width: menuPosition.width,
                maxHeight: menuPosition.maxHeight,
              }}
            >
              {options.length === 0 ? (
                <span className="layerum-select-empty">{emptyLabel}</span>
              ) : null}
              {options.map((option) => (
                <button
                  className={`layerum-select-option ${option.value === value ? 'active' : ''}`}
                  key={option.value}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(option.value);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={option.value === value}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
