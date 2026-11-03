'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { Modal } from './modal';
import { MfaSetupWizard } from './mfa-setup-wizard';
import './mfa-setup.css';

export function MfaEnforcementModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [wizardOpen, setWizardOpen] = useState(false);
  const token = session?.access_token;

  const dismissMutation = useMutation({
    mutationFn: () => api.dismissMfa(token!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
      onOpenChange(false);
      toast.info('Reminder snoozed for 7 days');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Modal
        open={open && !wizardOpen}
        title="Secure your account"
        onOpenChange={onOpenChange}
      >
        <motion.div
          className="mfa-nudge"
          initial={reduceMotion ? {} : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mfa-nudge-hero">
            <span className="mfa-shield-ring" aria-hidden="true">
              <ShieldCheck size={22} />
            </span>
            <div>
              <h3>Add two-factor authentication</h3>
              <p>
                Connect an authenticator app now — it takes under a minute
                and protects all your workspaces.
              </p>
            </div>
          </div>
          <div className="mfa-actions">
            <button
              type="button"
              className="mfa-ghost"
              disabled={dismissMutation.isPending}
              onClick={() => dismissMutation.mutate()}
            >
              {dismissMutation.isPending ? 'Snoozing...' : 'Remind later'}
            </button>
            <button
              type="button"
              className="mfa-primary"
              onClick={() => setWizardOpen(true)}
            >
              Set up now
            </button>
          </div>
        </motion.div>
      </Modal>

      <MfaSetupWizard
        open={wizardOpen}
        onOpenChange={(next) => {
          setWizardOpen(next);
          if (!next) {
            void queryClient.invalidateQueries({ queryKey: ['mfa-status'] });
            onOpenChange(false);
          }
        }}
      />
    </>
  );
}
