type UserProfileSource = {
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  picture?: string | null;
  picture_url?: string | null;
  avatarUrl?: string | null;
  photoURL?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readMetadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  if (!metadata) return null;
  return readString(metadata[key]);
}

export function resolveDisplayName(source: UserProfileSource | null | undefined, fallback = 'User') {
  if (!source) return fallback;

  return (
    readString(source.full_name) ??
    readString(source.name) ??
    readMetadataString(source.user_metadata, 'full_name') ??
    readMetadataString(source.user_metadata, 'name') ??
    fallback
  );
}

export function resolveAvatarUrl(source: UserProfileSource | null | undefined) {
  if (!source) return null;

  return (
    readString(source.avatar_url) ??
    readString(source.avatarUrl) ??
    readString(source.picture) ??
    readString(source.picture_url) ??
    readString(source.photoURL) ??
    readMetadataString(source.user_metadata, 'avatar_url') ??
    readMetadataString(source.user_metadata, 'avatarUrl') ??
    readMetadataString(source.user_metadata, 'picture') ??
    readMetadataString(source.user_metadata, 'picture_url') ??
    readMetadataString(source.user_metadata, 'photoURL')
  );
}

export function resolveInitials(source: UserProfileSource | null | undefined, fallback = 'U') {
  const name = resolveDisplayName(source, '').trim();
  const email = readString(source?.email);
  const seed = name || email || fallback;
  const parts = seed.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? fallback[0] ?? 'U';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}
