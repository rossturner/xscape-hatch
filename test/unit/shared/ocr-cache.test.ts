import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOcrCache, setOcrCache, hashImageUrl } from '../../../src/shared/ocr-cache';
import { OCR_CACHE } from '../../../src/shared/constants';

describe('ocr-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashImageUrl', () => {
    it('returns consistent hash for same URL', () => {
      const url = 'https://pbs.twimg.com/media/ABC123.jpg';
      expect(hashImageUrl(url)).toBe(hashImageUrl(url));
    });

    it('returns different hash for different URLs', () => {
      const url1 = 'https://pbs.twimg.com/media/ABC123.jpg';
      const url2 = 'https://pbs.twimg.com/media/DEF456.jpg';
      expect(hashImageUrl(url1)).not.toBe(hashImageUrl(url2));
    });
  });

  describe('getOcrCache', () => {
    it('returns null on cache miss', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await getOcrCache('https://example.com/image.jpg');
      expect(result).toBeNull();
    });

    it('returns entry on cache hit', async () => {
      const url = 'https://example.com/image.jpg';
      const hash = hashImageUrl(url);
      const entry = { handles: ['user.bsky.social'], processedAt: Date.now() };
      chrome.storage.local.get.mockResolvedValue({ [`xscape:ocr:${hash}`]: entry });
      const result = await getOcrCache(url);
      expect(result).toEqual(entry);
    });

    it('returns null for stale entry', async () => {
      const url = 'https://example.com/image.jpg';
      const hash = hashImageUrl(url);
      const staleTime = Date.now() - OCR_CACHE.ttl - 1000;
      const entry = { handles: [], processedAt: staleTime };
      chrome.storage.local.get.mockResolvedValue({ [`xscape:ocr:${hash}`]: entry });
      const result = await getOcrCache(url);
      expect(result).toBeNull();
    });

    it('removes stale entry from storage', async () => {
      const url = 'https://example.com/image.jpg';
      const hash = hashImageUrl(url);
      const staleTime = Date.now() - OCR_CACHE.ttl - 1000;
      const entry = { handles: [], processedAt: staleTime };
      chrome.storage.local.get.mockResolvedValue({ [`xscape:ocr:${hash}`]: entry });
      chrome.storage.local.remove.mockResolvedValue(undefined);
      await getOcrCache(url);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(`xscape:ocr:${hash}`);
    });
  });

  describe('setOcrCache', () => {
    it('stores entry with hashed key', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.get.mockResolvedValue({});
      const url = 'https://example.com/image.jpg';
      await setOcrCache(url, ['user.bsky.social']);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`xscape:ocr:${hashImageUrl(url)}`]: expect.objectContaining({ handles: ['user.bsky.social'] }),
        })
      );
    });

    it('stores processedAt timestamp', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.get.mockResolvedValue({});
      const url = 'https://example.com/image.jpg';
      const before = Date.now();
      await setOcrCache(url, []);
      const after = Date.now();
      const setCall = chrome.storage.local.set.mock.calls[0][0];
      const key = `xscape:ocr:${hashImageUrl(url)}`;
      expect(setCall[key].processedAt).toBeGreaterThanOrEqual(before);
      expect(setCall[key].processedAt).toBeLessThanOrEqual(after);
    });

    it('prunes old entries when exceeding maxEntries', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.remove.mockResolvedValue(undefined);

      const entries: Record<string, { handles: string[]; processedAt: number }> = {};
      for (let i = 0; i < OCR_CACHE.maxEntries + 5; i++) {
        entries[`xscape:ocr:hash${i}`] = {
          handles: [],
          processedAt: i * 1000,
        };
      }
      chrome.storage.local.get.mockResolvedValue(entries);

      await setOcrCache('https://example.com/new.jpg', []);

      expect(chrome.storage.local.remove).toHaveBeenCalledWith(
        expect.arrayContaining(['xscape:ocr:hash0'])
      );
    });
  });
});
