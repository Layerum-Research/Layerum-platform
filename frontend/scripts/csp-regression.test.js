const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_API_BASE_URL,
  buildContentSecurityPolicy,
} = require('../csp.config.js');

function getDirectiveTokens(csp, directiveName) {
  const directive = csp
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${directiveName} `));

  if (!directive) return [];

  return directive
    .slice(directiveName.length)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

test('allows Next.js inline bootstrap scripts', () => {
  const csp = buildContentSecurityPolicy({ nodeEnv: 'production' });
  const scriptSrcTokens = getDirectiveTokens(csp, 'script-src');

  assert.ok(scriptSrcTokens.includes("'self'"));
  assert.ok(scriptSrcTokens.includes("'unsafe-inline'"));
  assert.ok(!scriptSrcTokens.includes("'unsafe-eval'"));
});

test('allows eval only in non-production for Next.js dev runtime', () => {
  const csp = buildContentSecurityPolicy({ nodeEnv: 'development' });
  const scriptSrcTokens = getDirectiveTokens(csp, 'script-src');

  assert.ok(scriptSrcTokens.includes("'unsafe-eval'"));
});

test('includes default API origin in connect-src', () => {
  const csp = buildContentSecurityPolicy({
    apiBaseUrl: undefined,
    nodeEnv: 'production',
  });
  const connectSrcTokens = getDirectiveTokens(csp, 'connect-src');

  assert.ok(connectSrcTokens.includes("'self'"));
  assert.ok(connectSrcTokens.includes('https:'));
  assert.ok(connectSrcTokens.includes(new URL(DEFAULT_API_BASE_URL).origin));
});

test('includes configured absolute API origin in connect-src', () => {
  const csp = buildContentSecurityPolicy({
    apiBaseUrl: 'http://127.0.0.1:4100/v1',
    nodeEnv: 'production',
  });
  const connectSrcTokens = getDirectiveTokens(csp, 'connect-src');

  assert.ok(connectSrcTokens.includes('http://127.0.0.1:4100'));
});

test('ignores invalid API url values without throwing', () => {
  assert.doesNotThrow(() => {
    buildContentSecurityPolicy({
      apiBaseUrl: '/api',
      nodeEnv: 'production',
    });
  });

  const csp = buildContentSecurityPolicy({
    apiBaseUrl: '/api',
    nodeEnv: 'production',
  });
  const connectSrcTokens = getDirectiveTokens(csp, 'connect-src');

  assert.ok(!connectSrcTokens.includes('/api'));
});

test('allows the Supabase Realtime websocket in production', () => {
  const csp = buildContentSecurityPolicy({
    nodeEnv: 'production',
    supabaseUrl: 'https://project.supabase.co',
  });
  const connectSrcTokens = getDirectiveTokens(csp, 'connect-src');

  assert.ok(connectSrcTokens.includes('wss://project.supabase.co'));
  assert.ok(!connectSrcTokens.includes('wss:'));
});

test('adds the Supabase http origin to connect-src and img-src', () => {
  const csp = buildContentSecurityPolicy({
    nodeEnv: 'production',
    supabaseUrl: 'http://localhost:8000',
  });

  assert.ok(getDirectiveTokens(csp, 'connect-src').includes('http://localhost:8000'));
  assert.ok(getDirectiveTokens(csp, 'img-src').includes('http://localhost:8000'));
  assert.ok(getDirectiveTokens(csp, 'img-src').includes('https:'));
});

test('adds valid CSP_CONNECT_SRC_EXTRA origins and ignores invalid ones', () => {
  const csp = buildContentSecurityPolicy({
    nodeEnv: 'production',
    connectSrcExtra: 'http://localhost:9000 https://s3.example.com/ not-a-url javascript:alert(1) http://a.example.com/path',
  });
  const tokens = getDirectiveTokens(csp, 'connect-src');

  assert.ok(tokens.includes('http://localhost:9000'));
  assert.ok(tokens.includes('https://s3.example.com'));
  assert.ok(!tokens.includes('not-a-url'));
  assert.ok(!tokens.some((token) => token.startsWith('javascript:')));
  assert.ok(!tokens.includes('http://a.example.com'));
  assert.ok(tokens.includes('https:'));
});
