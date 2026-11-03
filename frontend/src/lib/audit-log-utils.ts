import type { AuditLog } from './types';

export type AuditStatusTone = 'success' | 'failed';

export function getAuditStatus(log: Pick<AuditLog, 'action' | 'metadata'>): AuditStatusTone {
  const explicit = log.metadata?.status;
  if (typeof explicit === 'string') {
    const lowered = explicit.toLowerCase();
    if (lowered.includes('fail') || lowered.includes('error')) return 'failed';
  }
  const success = log.metadata?.success;
  if (typeof success === 'boolean') {
    return success ? 'success' : 'failed';
  }
  const action = log.action.toLowerCase();
  if (action.includes('fail') || action.includes('error') || action.includes('denied')) {
    return 'failed';
  }
  return 'success';
}

export function getAuditUser(log: Pick<AuditLog, 'metadata'>) {
  const email = log.metadata?.user_email;
  if (typeof email === 'string' && email.trim()) return email.trim();
  const actor = log.metadata?.actor;
  if (typeof actor === 'string' && actor.trim()) return actor.trim();
  return 'system_main';
}

export function getAuditSubject(log: Pick<AuditLog, 'resource' | 'resource_id'>) {
  if (log.resource_id) return log.resource_id;
  return log.resource ?? '-';
}

export function getAuditHeadline(log: Pick<AuditLog, 'action' | 'resource'>) {
  return `${toLabel(log.action)} · ${toLabel(log.resource)}`;
}

function toLabel(value: string) {
  return value
    .split(/[_\s]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}
