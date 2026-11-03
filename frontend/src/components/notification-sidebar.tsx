'use client';

import { useEffect, useMemo } from 'react';
import { CheckCheck, X } from 'lucide-react';
import { describeNotification } from '@/lib/notification-messages';
import type { AppNotification } from '@/lib/types';
import './notification-sidebar.css';

type ResolvedNotification = {
  notification: AppNotification;
  title: string;
  detail: string;
  createdAtMs: number;
};

function timeAgo(createdAtMs: number) {
  const diffMs = Math.max(0, Date.now() - createdAtMs);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(createdAtMs).toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
  });
}

function dayKey(createdAtMs: number) {
  const date = new Date(createdAtMs);
  return date.toLocaleDateString('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dayLabel(createdAtMs: number) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (createdAtMs >= startToday) return 'Today';
  return dayKey(createdAtMs);
}

export function NotificationSidebar({
  open,
  onClose,
  items,
  isLoading,
  onMarkRead,
  onMarkAllRead,
}: {
  open: boolean;
  onClose: () => void;
  items: AppNotification[];
  isLoading: boolean;
  onMarkRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [open, onClose]);

  const resolved = useMemo<ResolvedNotification[]>(
    () =>
      items
        .map((notification) => ({
          notification,
          ...describeNotification(notification),
          createdAtMs: new Date(notification.created_at).getTime() || 0,
        }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    [items],
  );

  const groups = useMemo(() => {
    const out: Array<{ label: string; entries: ResolvedNotification[] }> = [];
    for (const entry of resolved) {
      const label = dayLabel(entry.createdAtMs);
      const last = out[out.length - 1];
      if (last && last.label === label) {
        last.entries.push(entry);
      } else {
        out.push({ label, entries: [entry] });
      }
    }
    return out;
  }, [resolved]);

  const unreadCount = resolved.length;

  return (
    <>
      {open ? <div className="notif-scrim" onClick={onClose} aria-hidden="true" /> : null}
      <aside
        className={`notif-sidebar${open ? ' open' : ''}`}
        role="dialog"
        aria-label="Notifications"
        aria-hidden={!open || undefined}
        inert={!open || undefined}
      >
        <header className="notif-head">
          <div className="notif-title-wrap">
            <h2>Notifications</h2>
            {unreadCount > 0 ? (
              <span className="notif-count">{unreadCount}</span>
            ) : null}
          </div>
          <div className="notif-head-actions">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="notif-ghost-btn"
                onClick={onMarkAllRead}
                aria-label="Mark all as read"
                title="Mark all as read"
              >
                <CheckCheck size={13} />
              </button>
            ) : null}
            <button
              type="button"
              className="notif-ghost-btn"
              onClick={onClose}
              aria-label="Close notifications"
              title="Close"
            >
              <X size={13} />
            </button>
          </div>
        </header>

        <div className="notif-body">
          {isLoading && resolved.length === 0 ? (
            <div className="notif-empty">
              <span className="notif-spinner" aria-hidden="true" />
            </div>
          ) : resolved.length === 0 ? (
            <div className="notif-empty">
              <p>All caught up</p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.label}>
                <p className="notif-group-label">{group.label}</p>
                <ul className="notif-list">
                  {group.entries.map((entry) => {
                    const isCritical = entry.notification.severity === 'critical';
                    return (
                      <li
                        key={entry.notification.id}
                        className={`notif-item unread${isCritical ? ' notif-failed' : ''}`}
                        role="button"
                        tabIndex={0}
                        title="Mark as read"
                        onClick={() => onMarkRead(entry.notification.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onMarkRead(entry.notification.id);
                          }
                        }}
                      >
                        <span className="notif-dot" aria-hidden="true" />
                        <div className="notif-item-main">
                          <div className="notif-headline-row">
                            <p className="notif-headline">{entry.title}</p>
                          </div>
                          <small className="notif-meta">{entry.detail}</small>
                        </div>
                        <time className="notif-time">{timeAgo(entry.createdAtMs)}</time>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
