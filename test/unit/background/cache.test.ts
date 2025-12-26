import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCachedHandle, setCachedHandle, pruneCache } from '../../../src/background/cache';
import { API_CACHE } from '../../../src/shared/constants';

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCachedHandle', () => {
    it('returns null on cache miss', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await getCachedHandle('user.bsky.social');
      expect(result).toBeNull();
    });

    it('returns entry on cache hit', async () => {
      const entry = { exists: true, displayName: 'User', checkedAt: Date.now() };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:user.bsky.social': entry });

      const result = await getCachedHandle('user.bsky.social');
      expect(result).toEqual(entry);
    });

    it('returns null and removes entry if TTL expired', async () => {
      const expiredTime = Date.now() - API_CACHE.ttl - 1000;
      const entry = { exists: true, displayName: null, checkedAt: expiredTime };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:user.bsky.social': entry });
      chrome.storage.local.remove.mockResolvedValue(undefined);

      const result = await getCachedHandle('user.bsky.social');
      expect(result).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('xscape:api:user.bsky.social');
    });

    it('returns null and removes entry if TTL expired for non-existing handle', async () => {
      const expiredTime = Date.now() - API_CACHE.ttl - 1000;
      const entry = { exists: false, displayName: null, checkedAt: expiredTime };
      chrome.storage.local.get.mockResolvedValue({ 'xscape:api:fake.bsky.social': entry });
      chrome.storage.local.remove.mockResolvedValue(undefined);

      const result = await getCachedHandle('fake.bsky.social');
      expect(result).toBeNull();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('xscape:api:fake.bsky.social');
    });
  });

  describe('setCachedHandle', () => {
    it('stores entry with correct key and structure', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      const beforeSet = Date.now();

      await setCachedHandle('user.bsky.social', true, 'Display Name');

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      const call = chrome.storage.local.set.mock.calls[0][0];
      expect(call['xscape:api:user.bsky.social']).toMatchObject({
        exists: true,
        displayName: 'Display Name',
      });
      expect(call['xscape:api:user.bsky.social'].checkedAt).toBeGreaterThanOrEqual(beforeSet);
    });

    it('stores non-existing handle', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);

      await setCachedHandle('fake.bsky.social', false);

      const call = chrome.storage.local.set.mock.calls[0][0];
      expect(call['xscape:api:fake.bsky.social']).toMatchObject({
        exists: false,
        displayName: null,
      });
    });
  });

  describe('pruneCache', () => {
    it('removes oldest entries when over limit', async () => {
      const entries: Record<string, unknown> = {};
      for (let i = 0; i < 10; i++) {
        entries[`xscape:api:user${i}.bsky.social`] = {
          exists: true,
          displayName: null,
          checkedAt: i * 1000,
        };
      }
      chrome.storage.local.get.mockResolvedValue(entries);
      chrome.storage.local.remove.mockResolvedValue(undefined);

      await pruneCache(5);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith([
        'xscape:api:user0.bsky.social',
        'xscape:api:user1.bsky.social',
        'xscape:api:user2.bsky.social',
        'xscape:api:user3.bsky.social',
        'xscape:api:user4.bsky.social',
      ]);
    });

    it('does nothing when under limit', async () => {
      const entries = {
        'xscape:api:user1.bsky.social': { exists: true, displayName: null, checkedAt: 1000 },
        'xscape:api:user2.bsky.social': { exists: true, displayName: null, checkedAt: 2000 },
      };
      chrome.storage.local.get.mockResolvedValue(entries);

      await pruneCache(5);

      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });
  });
});
