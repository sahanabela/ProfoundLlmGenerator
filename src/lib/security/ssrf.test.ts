import { describe, it, expect } from 'vitest';
import { isPrivateOrReservedIp, checkUrlSafety } from './ssrf';

describe('isPrivateOrReservedIp', () => {
  it('flags loopback addresses', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
  });

  it('flags private IPv4 ranges', () => {
    expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
  });

  it('flags link-local and the cloud metadata address', () => {
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.0.1')).toBe(true);
  });

  it('does not flag ordinary public IPs', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false);
  });

  it('flags IPv4-mapped IPv6 private addresses', () => {
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);
  });
});

describe('checkUrlSafety', () => {
  it('rejects non-http(s) schemes', async () => {
    const result = await checkUrlSafety('ftp://example.com');
    expect(result.safe).toBe(false);
  });

  it('rejects localhost by name', async () => {
    const result = await checkUrlSafety('http://localhost:3000');
    expect(result.safe).toBe(false);
  });

  it('rejects a literal loopback/private IP without needing DNS', async () => {
    expect((await checkUrlSafety('http://127.0.0.1')).safe).toBe(false);
    expect((await checkUrlSafety('http://192.168.1.5')).safe).toBe(false);
  });

  it('rejects malformed URLs', async () => {
    const result = await checkUrlSafety('not a url');
    expect(result.safe).toBe(false);
  });

  it('accepts a well-formed https URL without resolving DNS', async () => {
    const result = await checkUrlSafety('https://example.com/page', { resolve: false });
    expect(result.safe).toBe(true);
  });
});
