import { CACHE } from '../shared/constants.ts';

export async function getCachedHandle(handle) {
  const key = CACHE.prefix + handle;
  const result = await chrome.storage.local.get(key);
  const entry = result[key];

  if (!entry) return null;

  const ttl = entry.exists ? CACHE.existsTTL : CACHE.notExistsTTL;
  if (Date.now() - entry.checkedAt > ttl) {
    await chrome.storage.local.remove(key);
    return null;
  }

  return entry;
}

export async function setCachedHandle(handle, exists, displayName = null) {
  const key = CACHE.prefix + handle;
  await chrome.storage.local.set({
    [key]: {
      exists,
      displayName,
      checkedAt: Date.now(),
    },
  });
}

export async function pruneCache(maxEntries = 50000) {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([key]) => key.startsWith(CACHE.prefix))
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.checkedAt - b.checkedAt);

  if (entries.length > maxEntries) {
    const toRemove = entries.slice(0, entries.length - maxEntries).map(e => e.key);
    await chrome.storage.local.remove(toRemove);
  }
}
