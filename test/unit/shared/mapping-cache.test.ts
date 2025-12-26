import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadMappingCache,
  getMapping,
  saveMapping,
  shouldOverwriteMapping,
} from '../../../src/shared/mapping-cache';
import { MAPPING_CACHE } from '../../../src/shared/constants';

describe('mapping-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMapping', () => {
    it('returns null for unknown handle', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      await loadMappingCache();
      expect(getMapping('unknown')).toBeNull();
    });
  });

  describe('saveMapping', () => {
    it('stores mapping with correct key', async () => {
      chrome.storage.local.set.mockResolvedValue(undefined);
      chrome.storage.local.get.mockResolvedValue({});

      await saveMapping({
        twitterHandle: 'TestUser',
        blueskyHandle: 'testuser.bsky.social',
        displayName: 'Test User',
        source: 'text',
        discoveredAt: Date.now(),
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'xscape:mapping:testuser': expect.objectContaining({
            blueskyHandle: 'testuser.bsky.social',
          }),
        })
      );
    });
  });

  describe('shouldOverwriteMapping', () => {
    const baseMapping = {
      twitterHandle: 'user',
      blueskyHandle: 'user.bsky.social',
      displayName: null,
      discoveredAt: Date.now(),
    };

    it('text overwrites inferred', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'inferred' }, 'text')).toBe(true);
    });

    it('text overwrites image', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'image' }, 'text')).toBe(true);
    });

    it('image overwrites inferred', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'inferred' }, 'image')).toBe(true);
    });

    it('inferred does not overwrite text', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'text' }, 'inferred')).toBe(false);
    });

    it('inferred does not overwrite image', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'image' }, 'inferred')).toBe(false);
    });

    it('image does not overwrite text', () => {
      expect(shouldOverwriteMapping({ ...baseMapping, source: 'text' }, 'image')).toBe(false);
    });
  });
});
