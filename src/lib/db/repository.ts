// Thin persistence layer over Prisma. Keeps the pipeline/API route code from
// having to know Prisma's exact call shapes.

import { prisma } from './client';
import { normalizeOrigin } from '@/lib/crawler/normalizeUrl';
import type { MonitoringFrequency } from '@/types';

export function validateAndNormalizeInputUrl(raw: string): { ok: true; baseUrl: string; origin: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: 'That doesn\'t look like a valid URL. Try something like https://example.com.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// URLs are supported.' };
  }
  const origin = normalizeOrigin(url.toString());
  if (!origin) return { ok: false, error: 'Could not parse that URL.' };
  return { ok: true, baseUrl: url.toString(), origin };
}

export async function createOrGetWebsite(baseUrl: string, origin: string) {
  const existing = await prisma.website.findUnique({ where: { normalizedUrl: origin } });
  if (existing) return existing;
  return prisma.website.create({
    data: { baseUrl, normalizedUrl: origin },
  });
}

export function getWebsite(id: string) {
  return prisma.website.findUnique({ where: { id } });
}

export function listWebsites(limit = 20) {
  return prisma.website.findMany({ orderBy: { updatedAt: 'desc' }, take: limit });
}

export function updateWebsiteMonitoring(id: string, enabled: boolean, frequency: MonitoringFrequency, nextScheduledCrawlAt: Date | null) {
  return prisma.website.update({
    where: { id },
    data: { monitoringEnabled: enabled, monitoringFrequency: frequency, nextScheduledCrawlAt },
  });
}

export function touchWebsiteAfterCrawl(
  id: string,
  data: {
    siteName?: string;
    siteDescription?: string;
    lastCrawledAt: Date;
    nextScheduledCrawlAt: Date | null;
    robotsDisallowedPaths: string;
    existingLlmsTxtContent?: string | null;
    existingLlmsTxtCheckedAt?: Date;
  },
) {
  return prisma.website.update({ where: { id }, data });
}

export function createCrawl(websiteId: string, trigger: 'manual' | 'scheduled') {
  return prisma.crawl.create({ data: { websiteId, trigger, status: 'pending' } });
}

export function updateCrawl(id: string, data: Record<string, unknown>) {
  return prisma.crawl.update({ where: { id }, data });
}

export function getCrawl(id: string) {
  return prisma.crawl.findUnique({ where: { id } });
}

export function getLatestCrawl(websiteId: string) {
  return prisma.crawl.findFirst({ where: { websiteId }, orderBy: { startedAt: 'desc' } });
}

export function listRecentCrawls(websiteId: string, limit = 10) {
  return prisma.crawl.findMany({ where: { websiteId }, orderBy: { startedAt: 'desc' }, take: limit });
}

export function getPagesForWebsite(websiteId: string) {
  return prisma.page.findMany({ where: { websiteId, removedAt: null } });
}

export function getIncludedPages(websiteId: string) {
  return prisma.page.findMany({ where: { websiteId, included: true, removedAt: null }, orderBy: { importanceScore: 'desc' } });
}

export async function upsertPage(websiteId: string, url: string, data: Record<string, unknown>) {
  return prisma.page.upsert({
    where: { websiteId_url: { websiteId, url } },
    create: { websiteId, url, ...data },
    update: data,
  });
}

export function markPageMissing(id: string, missingSince: Date) {
  return prisma.page.update({ where: { id }, data: { missingSince } });
}

export function markPageRemoved(id: string, removedAt: Date) {
  return prisma.page.update({ where: { id }, data: { removedAt, included: false } });
}

export function clearPageMissing(id: string) {
  return prisma.page.update({ where: { id }, data: { missingSince: null } });
}

export async function createGeneratedFile(websiteId: string, content: string, stats: Record<string, unknown>) {
  const last = await prisma.generatedFile.findFirst({ where: { websiteId }, orderBy: { version: 'desc' } });
  const version = (last?.version ?? 0) + 1;
  return prisma.generatedFile.create({ data: { websiteId, content, version, stats: JSON.stringify(stats) } });
}

export function getLatestGeneratedFile(websiteId: string) {
  return prisma.generatedFile.findFirst({ where: { websiteId }, orderBy: { version: 'desc' } });
}

export function listGeneratedFiles(websiteId: string, limit = 20) {
  return prisma.generatedFile.findMany({ where: { websiteId }, orderBy: { version: 'desc' }, take: limit });
}

export function createChangeEvents(events: { websiteId: string; crawlId?: string; type: string; pageUrl: string; title?: string; summary?: string }[]) {
  if (events.length === 0) return Promise.resolve();
  return prisma.changeEvent.createMany({ data: events });
}

export function listChangeEvents(websiteId: string, limit = 50) {
  return prisma.changeEvent.findMany({ where: { websiteId }, orderBy: { createdAt: 'desc' }, take: limit });
}

export function findWebsitesDueForCrawl(now: Date) {
  return prisma.website.findMany({
    where: { monitoringEnabled: true, nextScheduledCrawlAt: { lte: now } },
  });
}
