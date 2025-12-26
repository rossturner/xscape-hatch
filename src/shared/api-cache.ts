import { API_CACHE } from './constants';
import { log } from './debug';
import type { ApiCacheEntry } from '../types';

export function isApiCacheStale(entry: ApiCacheEntry): boolean {
  return Date.now() - entry.checkedAt > API_CACHE.ttl;
}

export async function getApiCache(blueskyHandle: string): Promise<ApiCacheEntry | null> {
  const key = API_CACHE.prefix + blueskyHandle.toLowerCase();
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as ApiCacheEntry | undefined;

  if (!entry) {
    log('CACHE', `API miss: ${blueskyHandle}`);
    return null;
  }

  if (isApiCacheStale(entry)) {
    log('CACHE', `API expired: ${blueskyHandle}`);
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry;
}

export async function setApiCache(blueskyHandle: string, entry: ApiCacheEntry): Promise<void> {
  const key = API_CACHE.prefix + blueskyHandle.toLowerCase();
  log('CACHE', `API set: ${blueskyHandle} → exists=${entry.exists}`);
  await chrome.storage.local.set({ [key]: entry });
  await pruneApiCacheIfNeeded();
}

async function pruneApiCacheIfNeeded(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(API_CACHE.prefix))
    .map(([key, value]) => ({ key, ...(value as ApiCacheEntry) }))
    .sort((a, b) => a.checkedAt - b.checkedAt);

  if (entries.length > API_CACHE.maxEntries) {
    const toRemove = entries.slice(0, entries.length - API_CACHE.maxEntries).map((e) => e.key);
    log('CACHE', `API prune: removing ${toRemove.length} old entries`);
    await chrome.storage.local.remove(toRemove);
  }
}
