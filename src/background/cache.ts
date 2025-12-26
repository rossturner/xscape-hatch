import { API_CACHE } from '../shared/constants';
import { log } from '../shared/debug';
import type { CacheEntry } from '../types';

export async function getCachedHandle(handle: string): Promise<CacheEntry | null> {
  const key = API_CACHE.prefix + handle;
  const result = await chrome.storage.local.get(key);
  const entry = result[key] as CacheEntry | undefined;

  if (!entry) {
    log('CACHE', `Miss: ${handle}`);
    return null;
  }

  if (Date.now() - entry.checkedAt > API_CACHE.ttl) {
    log('CACHE', `Expired: ${handle}`);
    await chrome.storage.local.remove(key);
    return null;
  }

  log('CACHE', `Hit: ${handle} → exists=${entry.exists}`);
  return entry;
}

export async function setCachedHandle(
  handle: string,
  exists: boolean,
  displayName: string | null = null
): Promise<void> {
  const key = API_CACHE.prefix + handle;
  log('CACHE', `Set: ${handle} → exists=${exists}`);
  await chrome.storage.local.set({
    [key]: {
      exists,
      displayName,
      checkedAt: Date.now(),
    } satisfies CacheEntry,
  });
}

export async function pruneCache(maxEntries = API_CACHE.maxEntries): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(API_CACHE.prefix))
    .map(([key, value]) => ({ key, ...(value as CacheEntry) }))
    .sort((a, b) => a.checkedAt - b.checkedAt);

  if (entries.length > maxEntries) {
    const toRemove = entries.slice(0, entries.length - maxEntries).map((e) => e.key);
    log('CACHE', `Pruning ${toRemove.length} old entries`);
    await chrome.storage.local.remove(toRemove);
  }
}
