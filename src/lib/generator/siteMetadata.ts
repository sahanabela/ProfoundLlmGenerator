// Derives the site-level name/summary used as the H1 + blockquote of
// llms.txt, from the homepage's extracted metadata (with graceful fallbacks).

export interface SiteMetadataInput {
  origin: string;
  homepage?: {
    siteName: string | null;
    title: string | null;
    description: string | null;
  } | null;
}

export function deriveSiteMetadata(input: SiteMetadataInput): { siteName: string; siteDescription: string } {
  const hostname = safeHostname(input.origin);
  const siteName = input.homepage?.siteName || input.homepage?.title || hostname;
  const siteDescription = input.homepage?.description || `A curated map of the most useful pages on ${hostname} for AI agents.`;
  return { siteName, siteDescription };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
