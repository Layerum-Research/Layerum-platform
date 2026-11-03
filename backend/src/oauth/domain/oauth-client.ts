export const CLI_CLIENT_ID = 'layerum-cli';
export const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const DEFAULT_TOKEN_NAME = 'Layerum CLI';
export const MANUAL_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const MIN_PORT = 1024;
const MAX_PORT = 65535;

export function isAllowedRedirectUri(value: string) {
  if (value === MANUAL_REDIRECT_URI) return true;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const port = Number(url.port);
  return (
    url.href === value &&
    !value.includes('?') &&
    !value.includes('#') &&
    url.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    Number.isInteger(port) &&
    port >= MIN_PORT &&
    port <= MAX_PORT &&
    url.pathname === '/callback' &&
    url.search === '' &&
    url.hash === '' &&
    url.username === '' &&
    url.password === ''
  );
}
