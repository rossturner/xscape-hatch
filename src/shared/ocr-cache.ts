import { OCR_CACHE } from './constants';
import { log } from './debug';
import type { OcrCacheEntry } from '../types';

export function hashImageUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function isOcrCacheStale(entry: OcrCacheEntry): boolean {
  return Date.now() - entry.processedAt > OCR_CACHE.ttl;
}

export async function getOcrCache(imageUrl: string): Promise<OcrCacheEntry | null> {
  const key = OCR_CACHE.prefix + hashImageUrl(imageUrl);
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as OcrCacheEntry | undefined;

  if (!entry) {
    log('CACHE', `OCR miss: ${imageUrl.slice(0, 60)}...`);
    return null;
  }

  if (isOcrCacheStale(entry)) {
    log('CACHE', `OCR expired: ${imageUrl.slice(0, 60)}...`);
    await chrome.storage.local.remove(key);
    return null;
  }

  log('CACHE', `OCR hit: ${entry.handles.length} handles`);
  return entry;
}

export async function setOcrCache(imageUrl: string, handles: string[]): Promise<void> {
  const key = OCR_CACHE.prefix + hashImageUrl(imageUrl);
  log('CACHE', `OCR set: ${handles.length} handles for ${imageUrl.slice(0, 60)}...`);
  await chrome.storage.local.set({
    [key]: {
      handles,
      processedAt: Date.now(),
    } satisfies OcrCacheEntry,
  });
  await pruneOcrCacheIfNeeded();
}

async function pruneOcrCacheIfNeeded(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(OCR_CACHE.prefix))
    .map(([key, value]) => ({ key, ...(value as OcrCacheEntry) }))
    .sort((a, b) => a.processedAt - b.processedAt);

  if (entries.length > OCR_CACHE.maxEntries) {
    const toRemove = entries.slice(0, entries.length - OCR_CACHE.maxEntries).map((e) => e.key);
    log('CACHE', `OCR prune: removing ${toRemove.length} old entries`);
    await chrome.storage.local.remove(toRemove);
  }
}
