'use client';

import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './modal';

type ConfirmDestructiveModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  isPending?: boolean;
  onConfirm: () => void;
  requirePhrase?: boolean;
  phrase?: string;
  phraseLabel?: string;
  phraseHint?: string;
};

export function ConfirmDestructiveModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  isPending = false,
  onConfirm,
  requirePhrase = false,
  phrase = 'DELETE',
  phraseLabel = 'Confirmation Phrase',
  phraseHint,
}: ConfirmDestructiveModalProps) {
  const [value, setValue] = useState('');

  const normalizedPhrase = useMemo(() => phrase.trim(), [phrase]);
  const isPhraseValid = !requirePhrase || value === normalizedPhrase;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isPhraseValid || isPending) return;
    onConfirm();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setValue('');
    onOpenChange(nextOpen);
  }

  return (
    <Modal open={open} title={title} onOpenChange={handleOpenChange} disableClose={isPending}>
      <form className="layerum-stack" onSubmit={onSubmit}>
        <p className="layerum-list-meta">{description}</p>
        {requirePhrase ? (
          <div className="layerum-form-field">
            <label className="layerum-form-label">{phraseLabel}</label>
            <p className="layerum-form-hint">
              {phraseHint ?? (
                <>
                  Enter <strong>{normalizedPhrase}</strong> exactly to continue.
                </>
              )}
            </p>
            <input
              className="layerum-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={normalizedPhrase}
              required
            />
          </div>
        ) : null}
        <div className="layerum-button-group">
          <button
            type="button"
            className="layerum-button ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {cancelLabel}
          </button>
          <button
            className="layerum-button danger"
            disabled={isPending || !isPhraseValid}
            type="submit"
          >
            {!isPending ? <AlertTriangle size={14} aria-hidden="true" /> : null}
            {isPending ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
