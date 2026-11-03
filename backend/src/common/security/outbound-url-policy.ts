import { lookup } from 'node:dns/promises';
import net from 'node:net';

type OutboundUrlOptions = {
  label?: string;
  allowSearch?: boolean;
  allowedPrivateHosts?: ReadonlySet<string>;
};

const privateIpBlockList = new net.BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  privateIpBlockList.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  privateIpBlockList.addSubnet(address, prefix, 'ipv6');
}

export async function assertSafeOutboundHttpUrl(
  value: string,
  options: OutboundUrlOptions = {},
): Promise<URL> {
  const label = options.label ?? 'URL';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`${label} protocol is not allowed: ${protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain credentials`);
  }
  if (options.allowSearch === false && parsed.search) {
    throw new Error(`${label} must not contain query parameters`);
  }
  if (parsed.hash) {
    throw new Error(`${label} must not contain a fragment`);
  }

  const host = stripIpv6Brackets(parsed.hostname.trim().toLowerCase());
  if (!host) {
    throw new Error(`${label} host is required`);
  }
  if (options.allowedPrivateHosts?.has(host)) {
    return parsed;
  }
  if (isLocalHostname(host) || isUnsafeOutboundIpAddress(host)) {
    throw new Error(`${label} host is not allowed: ${host}`);
  }

  let resolved: Array<{ address: string }> = [];
  try {
    resolved = await lookup(host, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(
      `${label} host could not be resolved: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (resolved.length === 0) {
    throw new Error(`${label} host did not resolve to any addresses`);
  }

  for (const entry of resolved) {
    if (isUnsafeOutboundIpAddress(stripIpv6Brackets(entry.address))) {
      throw new Error(`${label} resolves to a private address`);
    }
  }

  return parsed;
}

export async function normalizeSafeOutboundBaseUrl(
  value: string,
  label = 'base_url',
) {
  const parsed = await assertSafeOutboundHttpUrl(value, {
    label,
    allowSearch: false,
    allowedPrivateHosts: providerAllowedPrivateHosts(),
  });
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

// Self-hosted installations may run model servers (Ollama, vLLM) on a private
// network. Only hosts the operator lists explicitly bypass the private-address check.
function providerAllowedPrivateHosts(): ReadonlySet<string> {
  return new Set(
    (process.env.PROVIDER_ALLOWED_PRIVATE_HOSTS ?? '')
      .split(',')
      .map((entry) => stripIpv6Brackets(entry.trim().toLowerCase()))
      .filter(Boolean),
  );
}

function stripIpv6Brackets(value: string) {
  return value.replace(/^\[|\]$/g, '');
}

function isLocalHostname(host: string) {
  return (
    host === 'localhost' ||
    host === 'localhost.localdomain' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  );
}

export function isUnsafeOutboundIpAddress(value: string) {
  const normalized = stripIpv6Brackets(value.trim().toLowerCase());
  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) return privateIpBlockList.check(normalized, 'ipv4');
  if (ipVersion === 6) return privateIpBlockList.check(normalized, 'ipv6');
  return false;
}
