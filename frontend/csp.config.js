const DEFAULT_API_BASE_URL = 'http://localhost:4000';

function resolveApiOrigin(apiBaseUrl = DEFAULT_API_BASE_URL) {
  try {
    const parsed = new URL(apiBaseUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveHttpOrigin(url) {
  if (!url) return null;
  return resolveApiOrigin(url);
}

function resolveExtraConnectOrigins(extra) {
  if (!extra) return [];
  return extra
    .split(/\s+/)
    .map((entry) => (/^https?:\/\/[^/?#]+\/?$/.test(entry) ? resolveHttpOrigin(entry) : null))
    .filter(Boolean);
}

function resolveRealtimeOrigin(supabaseUrl) {
  if (!supabaseUrl) return null;
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol === 'https:') return `wss://${parsed.host}`;
    if (parsed.protocol === 'http:') return `ws://${parsed.host}`;
  } catch {
    return null;
  }

  return null;
}

function buildContentSecurityPolicy(options = {}) {
  const apiBaseUrl = options.apiBaseUrl ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const supabaseUrl = options.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const connectSrcExtra = options.connectSrcExtra ?? process.env.CSP_CONNECT_SRC_EXTRA;
  const isProduction = nodeEnv === 'production';

  const connectSrc = new Set(["'self'", 'https:']);
  const apiOrigin = resolveApiOrigin(apiBaseUrl);
  if (apiOrigin) {
    connectSrc.add(apiOrigin);
  }
  const supabaseOrigin = resolveHttpOrigin(supabaseUrl);
  if (supabaseOrigin) {
    connectSrc.add(supabaseOrigin);
  }
  for (const origin of resolveExtraConnectOrigins(connectSrcExtra)) {
    connectSrc.add(origin);
  }
  const realtimeOrigin = resolveRealtimeOrigin(supabaseUrl);
  if (realtimeOrigin) {
    connectSrc.add(realtimeOrigin);
  }

  const imgSrc = new Set(["'self'", 'data:', 'blob:', 'https:']);
  if (supabaseOrigin) {
    imgSrc.add(supabaseOrigin);
  }

  const scriptSrc = new Set(["'self'", "'unsafe-inline'"]);
  if (!isProduction) {
    scriptSrc.add("'unsafe-eval'");
    connectSrc.add('ws:');
    connectSrc.add('wss:');
  }

  return [
    "default-src 'self'",
    `script-src ${Array.from(scriptSrc).join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${Array.from(imgSrc).join(' ')}`,
    "font-src 'self' data: https:",
    `connect-src ${Array.from(connectSrc).join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}

module.exports = {
  DEFAULT_API_BASE_URL,
  resolveApiOrigin,
  resolveRealtimeOrigin,
  buildContentSecurityPolicy,
};
