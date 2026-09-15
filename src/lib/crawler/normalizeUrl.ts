// URL normalization + classification helpers shared by discovery and crawling.

const TRACKING_PARAM_PREFIXES = ['utm_', 'mc_', 'ga_'];
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'igshid',
  'mkt_tok',
  'ref',
  'ref_src',
  'referrer',
  '_hsenc',
  '_hsmi',
  'trk',
  'trkCampaign',
  'spm',
  'si',
]);

const NON_CRAWLABLE_SCHEMES = new Set(['mailto:', 'tel:', 'javascript:', 'sms:', 'data:', 'ftp:', 'file:']);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.mp4', '.mp3', '.mov', '.avi', '.webm', '.wav',
  '.woff', '.woff2', '.ttf', '.eot',
  '.css', '.js', '.json', '.xml', '.csv',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

const AUTH_PATH_PATTERNS = [
  /\/logout\b/i,
  /\/sign[-_]?out\b/i,
  /\/login\b/i,
  /\/sign[-_]?in\b/i,
  /\/sign[-_]?up\b/i,
  /\/register\b/i,
  /\/account\/(password|reset|delete)/i,
  /\/wp-admin\b/i,
  /\/wp-login/i,
];

const UTILITY_PATH_PATTERNS = [
  /\/cart\b/i,
  /\/checkout\b/i,
  /\/cookies?-policy/i,
  /\/privacy(-policy)?\b/i,
  /\/terms\b/i,
  /\/legal\b/i,
  /\/unsubscribe\b/i,
  /\/search\b/i,
  /\/print\b/i,
];

export interface ParsedInternalUrl {
  normalized: string;
  original: string;
}

/**
 * Returns null when the URL should never be queued/crawled at all (unsupported
 * scheme, obviously non-HTML binary, etc). Otherwise returns the normalized
 * absolute URL string.
 */
export function normalizeUrl(rawUrl: string, baseUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl, baseUrl);
  } catch {
    return null;
  }

  if (NON_CRAWLABLE_SCHEMES.has(url.protocol)) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // Strip fragment.
  url.hash = '';

  // Strip known tracking params; keep everything else (pagination, real query state, etc).
  const params = Array.from(url.searchParams.keys());
  for (const key of params) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))) {
      url.searchParams.delete(key);
    }
  }
  // Sort remaining query params for a stable, de-duplicated key.
  const sortedParams = Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [k, v] of sortedParams) url.searchParams.append(k, v);

  // Normalize trailing slash: keep root "/", strip trailing slash elsewhere.
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  if (url.pathname === '') url.pathname = '/';

  // Lowercase host, drop default ports.
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }

  return url.toString();
}

export function isBinaryOrAssetUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    const ext = pathname.slice(pathname.lastIndexOf('.')).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
  } catch {
    return true;
  }
}

export function isSameSite(url: string, siteOrigin: string): boolean {
  try {
    const a = new URL(url);
    const b = new URL(siteOrigin);
    const hostA = a.hostname.replace(/^www\./, '');
    const hostB = b.hostname.replace(/^www\./, '');
    return hostA === hostB;
  } catch {
    return false;
  }
}

export function looksLikeAuthUrl(url: string): boolean {
  return AUTH_PATH_PATTERNS.some((re) => re.test(new URL(url).pathname));
}

export function looksLikeUtilityUrl(url: string): boolean {
  return UTILITY_PATH_PATTERNS.some((re) => re.test(new URL(url).pathname));
}

export function looksLikePaginationUrl(url: string): boolean {
  const u = new URL(url);
  if (/\/page\/\d+\/?$/i.test(u.pathname)) return true;
  if (u.searchParams.has('page') || u.searchParams.has('p') && /^\d+$/.test(u.searchParams.get('p') ?? '')) {
    const val = u.searchParams.get('page') ?? u.searchParams.get('p');
    if (val && /^\d+$/.test(val) && Number(val) > 1) return true;
  }
  if (/^\d+$/.test(u.searchParams.get('offset') ?? '') || /^\d+$/.test(u.searchParams.get('start') ?? '')) return true;
  return false;
}

export function looksLikeSearchUrl(url: string): boolean {
  const u = new URL(url);
  return /\/search\b/i.test(u.pathname) || u.searchParams.has('q') || u.searchParams.has('query');
}

/** Normalizes an origin (scheme + host, no path) for de-duplicating Websites. */
export function normalizeOrigin(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hostname = url.hostname.toLowerCase();
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return null;
  }
}
