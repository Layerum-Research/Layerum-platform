'use client';

import { useState, type FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { Modal } from './modal';
import './feedback-modal.css';

type FeedbackKind = 'bug' | 'question' | 'feature' | 'other';

type FeedbackModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName?: string | null;
  userEmail?: string | null;
  contextLabel?: string | null;
  contextPath?: string | null;
};

const FEEDBACK_OPTIONS: Array<{ key: FeedbackKind; label: string; hint: string }> = [
  { key: 'bug', label: 'Bug', hint: 'Something is broken or unexpected.' },
  { key: 'question', label: 'General question', hint: 'You need help understanding a flow.' },
  { key: 'feature', label: 'Feature request', hint: 'You want a new behavior or improvement.' },
  { key: 'other', label: 'Other', hint: 'Anything else you want to tell us.' },
];

export function FeedbackModal({
  open,
  onOpenChange,
  userName,
  userEmail,
  contextLabel,
  contextPath,
}: FeedbackModalProps) {
  const [message, setMessage] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<FeedbackKind[]>(['question']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const replyEmail = userEmail?.trim() ?? '';

  function toggleKind(kind: FeedbackKind) {
    setSelectedKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  }

  function resetForm() {
    setMessage('');
    setSelectedKinds(['question']);
    setIsSubmitting(false);
    setErrorMessage('');
  }

  function handleClose(nextOpen: boolean) {
    if (nextOpen) return;
    onOpenChange(false);
    resetForm();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !replyEmail) return;
    setIsSubmitting(true);
    setErrorMessage('');

    void (async () => {
      try {
        await api.submitFeedbackRequest({
          name: userName?.trim() || 'Anonymous',
          email: replyEmail,
          message: message.trim(),
          categories: selectedKinds,
          context: contextLabel ?? undefined,
          page: contextPath ?? undefined,
        });
        toast.success('Feedback sent');
        onOpenChange(false);
        resetForm();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to send feedback');
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  return (
    <Modal open={open} title="Feedback" onOpenChange={handleClose}>
      <form className="feedback-modal" onSubmit={handleSubmit}>
        <div className="layerum-form-field">
          <p className="layerum-form-hint feedback-intro">
            Have any question or bug? Contact us and we will help you.
          </p>
        </div>

        <div className="layerum-form-field">
          <label className="layerum-form-label">What best describes this?</label>
          <p className="layerum-form-hint">Check every category that applies.</p>
          <div className="feedback-kind-grid">
            {FEEDBACK_OPTIONS.map((option) => (
              <label key={option.key} className="feedback-kind-option">
                <input
                  checked={selectedKinds.includes(option.key)}
                  onChange={() => toggleKind(option.key)}
                  type="checkbox"
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="layerum-form-field">
          <label className="layerum-form-label" htmlFor="feedback-message">
            Message
          </label>
          <p className="layerum-form-hint">
            Tell us what happened, what you expected, or what you need help with.
          </p>
          <textarea
            className="layerum-textarea feedback-message"
            id="feedback-message"
            minLength={10}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Describe the issue or question..."
            required
            value={message}
          />
        </div>

        <div className="feedback-meta">
          <div>
            <span>Reply to</span>
            <strong>{userEmail ?? 'your account email'}</strong>
          </div>
          {contextLabel ? (
            <div>
              <span>Context</span>
              <strong>{contextLabel}</strong>
            </div>
          ) : null}
        </div>

        {errorMessage ? <p className="layerum-form-hint feedback-error">{errorMessage}</p> : null}

        <div className="layerum-button-group feedback-actions">
          <button className="layerum-button ghost" type="button" onClick={() => handleClose(false)}>
            Cancel
          </button>
          <button className="layerum-button" type="submit" disabled={isSubmitting || !message.trim() || !replyEmail}>
            <Mail size={14} />
            {isSubmitting ? 'Sending...' : 'Send feedback'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
