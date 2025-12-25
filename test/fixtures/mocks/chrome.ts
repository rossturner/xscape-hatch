import chrome from 'vitest-chrome';

export function mockCacheHit(handle: string, exists: boolean, displayName: string | null = null) {
  const key = `bsky:${handle}`;
  chrome.storage.local.get.mockResolvedValue({
    [key]: { exists, displayName, checkedAt: Date.now() },
  });
}

export function mockCacheMiss() {
  chrome.storage.local.get.mockResolvedValue({});
}

export function mockExpiredCache(handle: string, exists: boolean, ageMs: number) {
  const key = `bsky:${handle}`;
  chrome.storage.local.get.mockResolvedValue({
    [key]: { exists, displayName: null, checkedAt: Date.now() - ageMs },
  });
}
