import { NextResponse } from 'next/server';
import { listWebsitesWithLatestFile } from '@/lib/db/repository';

// Backs the "Library" tab: every website paired with its current generated
// llms.txt file (latest version), for a flat, downloadable table view.
export async function GET() {
  const websites = await listWebsitesWithLatestFile();

  const files = websites
    .filter((w) => w.generatedFiles.length > 0)
    .map((w) => {
      const latest = w.generatedFiles[0];
      return {
        websiteId: w.id,
        siteName: w.siteName,
        normalizedUrl: w.normalizedUrl,
        monitoringEnabled: w.monitoringEnabled,
        monitoringFrequency: w.monitoringFrequency,
        version: latest.version,
        stats: latest.stats,
        generatedAt: latest.createdAt,
      };
    });

  return NextResponse.json({ files });
}
