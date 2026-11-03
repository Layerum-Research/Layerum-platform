const FALLBACK_PATH = '/workspaces';

export function safeNextPath(path: string | null | undefined, fallback = FALLBACK_PATH) {
  if (!path) return fallback;
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}
