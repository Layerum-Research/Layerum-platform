'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import './modal.css';

type ModalProps = {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  disableClose?: boolean;
  floating?: React.ReactNode;
  floatingClassName?: string;
  overlayFloating?: React.ReactNode;
  overlayFloatingClassName?: string;
};

export function Modal({
  open,
  title,
  onOpenChange,
  children,
  disableClose = false,
  floating,
  floatingClassName,
  overlayFloating,
  overlayFloatingClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open || disableClose) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, disableClose, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!disableClose) onOpenChange(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
        <section className="modal-panel">
          <header className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              className="modal-close"
              aria-label="Close modal"
              disabled={disableClose}
              onClick={() => onOpenChange(false)}
              type="button"
            >
              <X size={14} />
            </button>
          </header>
          <div className="modal-body">{children}</div>
        </section>
        {floating ? (
          <aside className={`modal-floating ${floatingClassName ?? ''}`.trim()}>{floating}</aside>
        ) : null}
      </div>
      {overlayFloating ? (
        <aside
          className={`modal-overlay-floating ${overlayFloatingClassName ?? ''}`.trim()}
          onClick={(event) => event.stopPropagation()}
        >
          {overlayFloating}
        </aside>
      ) : null}
    </div>
  );
}
