'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Modal } from './modal';
import './mfa-setup.css';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionLabel: string;
  description?: string;
  onVerified: () => void;
};

/**
 * Step-up authentication: asks for the current TOTP code and verifies it
 * against the user's enrolled factor before a sensitive action proceeds.
 * Renders nothing useful when the user has no verified factor — parents
 * should only open it when `mfa-status.enrolled` is true.
 */
export function MfaStepUpModal({
  open,
  onOpenChange,
  actionLabel,
  description,
  onVerified,
}: Props) {
  const reduceMotion = useReducedMotion();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorShake, setErrorShake] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setFactorId(null);
      setChallengeId(null);
      setCode('');
      setVerifying(false);
      return;
    }
    let cancelled = false;
    async function prepare() {
      setLoadingChallenge(true);
      try {
        const { data: factors, error: factorsError } =
          await supabase.auth.mfa.listFactors();
        if (factorsError) throw factorsError;
        const verified = (factors?.totp ?? []).find(
          (factor) => factor.status === 'verified',
        );
        if (!verified) throw new Error('No authenticator app linked');
        const { data: challenge, error: challengeError } =
          await supabase.auth.mfa.challenge({ factorId: verified.id });
        if (challengeError) throw challengeError;
        if (cancelled) return;
        setFactorId(verified.id);
        setChallengeId(challenge.id);
        window.setTimeout(() => inputRef.current?.focus(), 60);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'MFA check failed');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoadingChallenge(false);
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6 || !factorId || !challengeId || verifying) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: clean,
      });
      if (error) throw error;
      onOpenChange(false);
      onVerified();
    } catch (error) {
      setErrorShake((n) => n + 1);
      toast.error(error instanceof Error ? error.message : 'Invalid code');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Confirm it's you"
      onOpenChange={onOpenChange}
      disableClose={verifying || loadingChallenge}
    >
      <motion.form
        className="mfa-stepup"
        onSubmit={onSubmit}
        initial={reduceMotion ? {} : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mfa-stepup-hero">
          <span className="mfa-shield-ring mfa-shield-ring-sm" aria-hidden="true">
            <ShieldCheck size={20} />
          </span>
          <p>
            {description ??
              `Enter the 6-digit code from your authenticator app to ${actionLabel}.`}
          </p>
        </div>
        <motion.input
          key={errorShake}
          ref={inputRef}
          className="mfa-stepup-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="– – – – – –"
          maxLength={6}
          value={code}
          disabled={loadingChallenge || !challengeId}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
          }
          animate={reduceMotion ? {} : errorShake ? { x: [0, -8, 8, -5, 5, 0] } : {}}
          transition={{ duration: 0.35 }}
          aria-label="Authenticator code"
        />
        <button
          className="mfa-primary"
          disabled={
            verifying || loadingChallenge || !challengeId || code.length !== 6
          }
          type="submit"
        >
          {verifying ? <Loader2 size={14} className="mfa-spin" /> : null}
          {loadingChallenge
            ? 'Preparing...'
            : verifying
              ? 'Verifying...'
              : 'Confirm'}
        </button>
      </motion.form>
    </Modal>
  );
}
