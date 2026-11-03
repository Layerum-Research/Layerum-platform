'use client';

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import { resolveInitials } from '@/lib/user-profile';

type UserAvatarProps = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  alt?: string;
  size?: number;
  className?: string;
};

export function UserAvatar({
  name,
  email,
  avatarUrl,
  alt,
  size = 32,
  className,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const initials = resolveInitials({ full_name: name ?? null, email: email ?? null });
  const safeAvatarUrl = avatarUrl?.trim() || '';
  const showImage = Boolean(safeAvatarUrl) && !imageError;
  const ariaLabel = alt ?? name ?? email ?? 'User avatar';

  useEffect(() => {
    setImageError(false);
  }, [safeAvatarUrl]);

  return (
    <span
      className={className}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 'inherit',
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(135deg, #5dc6d3, #345f94 42%, #273259)',
        color: 'var(--app-accent-soft)',
        flex: '0 0 auto',
      }}
    >
      {showImage ? (
        <img
          src={safeAvatarUrl}
          alt={ariaLabel}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImageError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: '100%',
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            fontSize: Math.max(10, Math.round(size * 0.34)),
            fontWeight: 700,
            letterSpacing: '-0.04em',
          }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
