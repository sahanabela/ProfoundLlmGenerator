// Basic SSRF protections for a service that fetches arbitrary user-supplied URLs.
//
// This is intentionally NOT enterprise-grade (no DNS-rebinding pinning, no proxy
// allowlist, etc.) — see README > Tradeoffs. It covers the practical basics:
// scheme allowlisting, blocking loopback/private/link-local/reserved addresses,
// and re-checking every redirect hop before it is followed.

import dns from 'node:dns/promises';
import net from 'node:net';

export interface SafetyCheck {
  safe: boolean;
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'metadata.google.internal']);

/** Cloud metadata endpoint — a classic SSRF target, blocked regardless of DNS result. */
const METADATA_IPS = new Set(['169.254.169.254', 'fd00:ec2::254']);

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Range(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

const PRIVATE_IPV4_RANGES = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10', // carrier-grade NAT
  '127.0.0.0/8', // loopback
  '169.254.0.0/16', // link-local (incl. cloud metadata)
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24', // TEST-NET
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24', // TEST-NET-2
  '203.0.113.0/24', // TEST-NET-3
  '224.0.0.0/4', // multicast
  '240.0.0.0/4', // reserved
  '255.255.255.255/32',
];

export function isPrivateOrReservedIp(ip: string): boolean {
  if (METADATA_IPS.has(ip)) return true;

  if (net.isIPv4(ip)) {
    return PRIVATE_IPV4_RANGES.some((range) => inIpv4Range(ip, range));
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    // IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) — check the embedded IPv4.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateOrReservedIp(mapped[1]);
    // Unique local (fc00::/7) and link-local (fe80::/10) address blocks.
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
      return true;
    }
    return false;
  }

  return true; // unrecognized format — fail closed
}

/**
 * Validate a URL string is safe to fetch: http(s) only, hostname isn't an
 * obviously-blocked name, and (when `resolve` is true) none of its resolved
 * IP addresses are loopback/private/link-local/reserved.
 */
export async function checkUrlSafety(rawUrl: string, opts: { resolve?: boolean } = {}): Promise<SafetyCheck> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Not a valid URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported scheme "${parsed.protocol}" — only http/https are allowed` };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local')) {
    return { safe: false, reason: `Hostname "${hostname}" is not allowed` };
  }

  // A literal IP in the URL itself.
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      return { safe: false, reason: `IP address ${hostname} is a private/reserved address` };
    }
    return { safe: true };
  }

  if (opts.resolve === false) return { safe: true };

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) {
      return { safe: false, reason: `Could not resolve hostname "${hostname}"` };
    }
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return { safe: false, reason: `Hostname "${hostname}" resolves to a private/reserved address (${record.address})` };
      }
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: `DNS lookup failed for "${hostname}"` };
  }
}
