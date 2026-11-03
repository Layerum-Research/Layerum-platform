'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Copy, Loader2, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useTheme } from '@/providers/theme-provider';
import { Modal } from './modal';
import './mfa-setup.css';

type Step = 'intro' | 'qr' | 'verify' | 'done';

type EnrollData = {
  factorId: string;
  secret: string;
  uri: string;
};

function MfaQrCode({ uri }: { uri: string }) {
  const { theme } = useTheme();
  return (
    <QRCodeSVG
      value={uri}
      size={200}
      level="M"
      marginSize={2}
      bgColor="transparent"
      fgColor={theme === 'light' ? '#141519' : '#FFFFFF'}
      className="mfa-qr"
    />
  );
}

const STEP_ORDER: Step[] = ['intro', 'qr', 'verify', 'done'];

function MfaCodeTimer() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const elapsed = Math.floor(now / 1000) % 30;
  const left = 30 - elapsed;
  return (
    <div className="mfa-timer" aria-hidden="true">
      <div
        className={`mfa-timer-bar${left <= 5 ? ' urgent' : ''}`}
        style={{ transform: `scaleX(${left / 30})` }}
      />
      <span>New code in {left}s</span>
    </div>
  );
}

export function MfaSetupWizard({
  open,
  onOpenChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>('intro');
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [pending, setPending] = useState(false);
  const [errorShake, setErrorShake] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dir, setDir] = useState(1);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  function goStep(next: Step, direction?: number) {
    setDir(
      direction ?? (STEP_ORDER.indexOf(next) >= STEP_ORDER.indexOf(step) ? 1 : -1),
    );
    setStep(next);
  }

  useEffect(() => {
    if (open) {
      setDir(1);
      setStep('intro');
      setEnroll(null);
      setChallengeId(null);
      setCode(['', '', '', '', '', '']);
      setPending(false);
    }
  }, [open ]);

  // Cleanup unverified factor if user closes mid-flow.
  useEffect(() => {
    if (!open && enroll && step !== 'done') {
      const factorId = enroll.factorId;
      setEnroll(null);
      void supabase.auth.mfa
        .unenroll({ factorId })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open ]);

  async function startEnroll() {
    setPending(true);
    try {
      // Remove stale unverified factors first so re-entry is clean.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = (existing?.all ?? []).filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified',
      );
      for (const factor of stale) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator App',
      });
      if (error) throw error;
      if (data?.type !== 'totp' || !data.totp.uri) {
        throw new Error('Enrollment failed. Try again.');
      }
      setEnroll({
        factorId: data.id,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
      goStep('qr', 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enrollment failed');
    } finally {
      setPending(false);
    }
  }

  async function goToVerify() {
    if (!enroll) return;
    setPending(true);
    try {
      // TOTP verify needs a fresh challenge id.
      const { data, error } = await supabase.auth.mfa.challenge({
        factorId: enroll.factorId,
      });
      if (error) throw error;
      setChallengeId(data.id);
      goStep('verify', 1);
      window.setTimeout(() => inputRefs.current[0]?.focus(), 60);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Challenge failed');
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(nextCode?: string) {
    const joined = (nextCode ?? code.join('')).replace(/\D/g, '');
    if (joined.length !== 6 || !enroll || !challengeId) return;
    setPending(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId,
        challengeId,
        code: joined,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      // Refresh session so AAL upgrades to aal2 client-side.
      await supabase.auth.refreshSession();
      goStep('done', 1);
      onComplete?.();
    } catch (error) {
      setErrorShake((n) => n + 1);
      toast.error(error instanceof Error ? error.message : 'Invalid code');
    } finally {
      setPending(false);
    }
  }

  function handleDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
    // Auto-submit when full.
    window.setTimeout(() => {
      setCode((prev) => {
        if (prev.every((d) => d !== '')) void verifyCode(prev.join(''));
        return prev;
      });
    }, 30);
  }

  function handleKeyDown(index: number, key: string) {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 0) return;
    const next = ['', '', '', '', '', ''].map((_, i) => digits[i] ?? '');
    setCode(next);
    const focusIndex = Math.min(digits.length, 5);
    inputRefs.current[focusIndex]?.focus();
    if (digits.length === 6) void verifyCode(digits.join(''));
  }

  async function copySecret() {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Copy failed. Type the key manually.');
    }
  }

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, x: 28 * dir },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -28 * dir },
        transition: { duration: 0.24, ease: [0.32, 0.72, 0, 1] as const },
      };

  const staggerParent = reduceMotion
    ? {}
    : {
        initial: 'hidden' as const,
        animate: 'show' as const,
        variants: {
          hidden: {},
          show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
        },
      };

  const staggerChild = reduceMotion
    ? {}
    : {
        variants: {
          hidden: { opacity: 0, y: 10 },
          show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] as const },
          },
        },
      };

  return (
    <Modal
      open={open}
      title="Set up two-factor authentication"
      onOpenChange={onOpenChange}
      disableClose={pending}
    >
      <div className="mfa-wizard">
        <div className="mfa-progress">
          <ol className="mfa-steps" aria-label="Setup progress">
            {STEP_ORDER.map((s, i) => (
              <li
                key={s}
                className={`mfa-step-dot${step === s ? ' active' : ''}${
                  STEP_ORDER.indexOf(step) > i ? ' passed' : ''
                }`}
              />
            ))}
          </ol>
          {step !== 'done' ? (
            <span className="mfa-step-label">
              Step {Math.min(STEP_ORDER.indexOf(step) + 1, 3)} of 3
            </span>
          ) : null}
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          {step === 'intro' ? (
            <motion.div key="intro" className="mfa-pane" {...motionProps}>
              <div className="mfa-hero">
                <span className="mfa-hero-glow" aria-hidden="true" />
                <motion.span
                  className="mfa-shield-ring"
                  aria-hidden="true"
                  initial={reduceMotion ? {} : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                >
                  <ShieldCheck size={26} />
                </motion.span>
                <h3>Extra shield for your workspace</h3>
                <p>
                  Link an authenticator app (Google Authenticator, 1Password,
                  Authy). You will enter a 6-digit code after your password.
                </p>
              </div>
              <motion.ul className="mfa-bullets" {...staggerParent}>
                <motion.li {...staggerChild}>
                  <span className="mfa-bullet-num">1</span>
                  <Smartphone size={14} />
                  Scan the QR code with your app
                </motion.li>
                <motion.li {...staggerChild}>
                  <span className="mfa-bullet-num">2</span>
                  <QrCode size={14} />
                  Enter the 6-digit code to confirm
                </motion.li>
                <motion.li {...staggerChild}>
                  <span className="mfa-bullet-num">3</span>
                  <Check size={14} />
                  Done in under a minute
                </motion.li>
              </motion.ul>
              <button
                type="button"
                className="mfa-primary"
                disabled={pending || !session}
                onClick={() => void startEnroll()}
              >
                {pending ? <Loader2 size={14} className="mfa-spin" /> : null}
                {pending ? 'Preparing...' : 'Start setup'}
              </button>
            </motion.div>
          ) : null}

          {step === 'qr' && enroll ? (
            <motion.div key="qr" className="mfa-pane" {...motionProps}>
              <h3 className="mfa-pane-title">Scan this QR code</h3>
              <p className="mfa-pane-sub">
                Open your authenticator app, add an account, scan below.
              </p>
              <motion.div
                className="mfa-qr-frame"
                initial={reduceMotion ? {} : { scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 19 }}
              >
                <span className="mfa-qr-glow" aria-hidden="true" />
                <MfaQrCode uri={enroll.uri} />
              </motion.div>
              <div className="mfa-secret-block">
                <span className="mfa-secret-label">Can&apos;t scan? Enter this key manually</span>
                <div className="mfa-secret-row">
                  <code>{enroll.secret}</code>
                  <button type="button" onClick={() => void copySecret()} aria-label="Copy secret">
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
              <div className="mfa-actions">
                <button type="button" className="mfa-ghost" onClick={() => goStep('intro')}>
                  Back
                </button>
                <button
                  type="button"
                  className="mfa-primary"
                  disabled={pending}
                  onClick={() => void goToVerify()}
                >
                  {pending ? <Loader2 size={14} className="mfa-spin" /> : null}
                  {pending ? 'Preparing...' : 'Continue'}
                </button>
              </div>
            </motion.div>
          ) : null}

          {step === 'verify' ? (
            <motion.div key="verify" className="mfa-pane" {...motionProps}>
              <h3 className="mfa-pane-title">Enter 6-digit code</h3>
              <p className="mfa-pane-sub">
                Type the current code from your authenticator app.
              </p>
              <motion.div
                key={errorShake}
                className="mfa-code-row"
                animate={reduceMotion ? {} : errorShake ? { x: [0, -8, 8, -5, 5, 0] } : {}}
                transition={{ duration: 0.35 }}
              >
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    className={`mfa-code-box${digit ? ' filled' : ''}`}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigit(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e.key)}
                    onPaste={(e) => {
                      e.preventDefault();
                      handlePaste(e.clipboardData.getData('text'));
                    }}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </motion.div>
              <MfaCodeTimer />
              <div className="mfa-actions">
                <button type="button" className="mfa-ghost" onClick={() => goStep('qr')}>
                  Back
                </button>
                <button
                  type="button"
                  className="mfa-primary"
                  disabled={pending || code.some((d) => !d)}
                  onClick={() => void verifyCode()}
                >
                  {pending ? <Loader2 size={14} className="mfa-spin" /> : null}
                  {pending ? 'Verifying...' : 'Verify & enable'}
                </button>
              </div>
            </motion.div>
          ) : null}

          {step === 'done' ? (
            <motion.div key="done" className="mfa-pane mfa-done" {...motionProps}>
              <motion.span
                className="mfa-success-ring"
                initial={reduceMotion ? {} : { scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 15 }}
              >
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
                  <motion.path
                    d="M4.5 12.5l5 5 10-11"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={reduceMotion ? {} : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, delay: 0.15, ease: 'easeOut' }}
                  />
                </svg>
              </motion.span>
              <motion.h3
                initial={reduceMotion ? {} : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.25 }}
              >
                Two-factor enabled
              </motion.h3>
              <motion.p
                initial={reduceMotion ? {} : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.33, duration: 0.25 }}
              >
                Your account now requires an authenticator code at sign-in.
              </motion.p>
              <button
                type="button"
                className="mfa-primary"
                onClick={() => onOpenChange(false)}
              >
                Done
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </Modal>
  );
}
