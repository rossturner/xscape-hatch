import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApiCache, setApiCache, isApiCacheStale } from '../../../src/shared/api-cache';
import { API_CACHE } from '../../../src/shared/constants';

describe('api-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getApiCache', () => {
    it('returns null on cache miss', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await getApiCache('user.bsky.social');
      expect(result).toBeNull();
    });

    it('returns entry on cache hit', async () => {
      const entry = { exists: true, displayName: 'User', checkedAt: Date.now() };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:user.bsky.social': entry });
      const result = await getApiCache('user.bsky.social');
      expect(result).toEqual(entry);
    });

    it('returns null for stale entry and removes it from storage', async () => {
      const staleTime = Date.now() - API_CACHE.ttl - 1000;
      const entry = { exists: true, displayName: null, checkedAt: staleTime };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:user.bsky.social': entry });
      chrome.storage.local.remove.mockResolvedValue(undefined);
      const result = await getApiCache('user.bsky.social');
      expect(result).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('xscape:api:user.bsky.social');
    });

    it('normalizes handle case for lookups', async () => {
      const entry = { exists: true, displayName: 'User', checkedAt: Date.now() };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:user.bsky.social': entry });
      const result = await getApiCache('USER.bsky.social');
      expect(chrome.storage.local.get).toHaveBeenCalledWith('xscape:api:user.bsky.social');
      expect(result).toEqual(entry);
    });
  });

  describe('setApiCache', () => {
    it('stores entry with correct key', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.get.mockResolvedValue({});
      await setApiCache('user.bsky.social', { exists: true, displayName: 'User', checkedAt: Date.now() });
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'xscape:api:user.bsky.social': expect.objectContaining({ exists: true, displayName: 'User' }),
        })
      );
    });

    it('normalizes handle case for storage', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.get.mockResolvedValue({});
      await setApiCache('USER.bsky.social', { exists: true, displayName: 'User', checkedAt: Date.now() });
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'xscape:api:user.bsky.social': expect.any(Object),
        })
      );
    });

    it('prunes old entries when exceeding maxEntries', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.remove.mockResolvedValue(undefined);

      const entries: Record<string, { exists: boolean; displayName: null; checkedAt: number }> = {};
      for (let i = 0; i < API_CACHE.maxEntries + 5; i++) {
        entries[`xscape:api:user${i}.bsky.social`] = {
          exists: true,
          displayName: null,
          checkedAt: i * 1000,
        };
      }
      chrome.storage.local.get.mockResolvedValue(entries);

      await setApiCache('newuser.bsky.social', { exists: true, displayName: null, checkedAt: Date.now() });

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        expect.arrayContaining(['xscape:api:user0.bsky.social'])
      );
    });
  });

  describe('isApiCacheStale', () => {
    it('returns false for fresh entry', () => {
      const entry = { exists: true, displayName: null, checkedAt: Date.now() };
      expect(isApiCacheStale(entry)).toBe(false);
    });

    it('returns true for stale entry', () => {
      const entry = { exists: true, displayName: null, checkedAt: Date.now() - API_CACHE.ttl - 1000 };
      expect(isApiCacheStale(entry)).toBe(true);
    });
  });
});
