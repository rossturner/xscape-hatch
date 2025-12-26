import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupHandle } from '../../../src/shared/handle-lookup';
import * as apiCache from '../../../src/shared/api-cache';

vi.mock('../../../src/shared/api-cache');

describe('lookupHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cached result if available', async () => {
    const cached = { exists: true, displayName: 'User', checkedAt: Date.now() };
    vi.mocked(apiCache.getApiCache).mockResolvedValue(cached);

    const result = await lookupHandle('user.bsky.social');

    expect(result).toEqual(cached);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('calls API and caches result if not cached', async () => {
    vi.mocked(apiCache.getApiCache).mockResolvedValue(null);
    vi.mocked(apiCache.setApiCache).mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ exists: true, displayName: 'User' });

    const result = await lookupHandle('user.bsky.social');

    expect(result.exists).toBe(true);
    expect(result.displayName).toBe('User');
    expect(apiCache.setApiCache).toHaveBeenCalledWith(
      'user.bsky.social',
      expect.objectContaining({ exists: true, displayName: 'User' })
    );
  });

  it('caches non-existent handles', async () => {
    vi.mocked(apiCache.getApiCache).mockResolvedValue(null);
    vi.mocked(apiCache.setApiCache).mockResolvedValue(undefined);
    chrome.runtime.sendMessage.mockResolvedValue({ exists: false, displayName: null });

    const result = await lookupHandle('fake.bsky.social');

    expect(result.exists).toBe(false);
    expect(apiCache.setApiCache).toHaveBeenCalledWith(
      'fake.bsky.social',
      expect.objectContaining({ exists: false })
    );
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(apiCache.getApiCache).mockResolvedValue(null);
    chrome.runtime.sendMessage.mockResolvedValue({ error: true });

    const result = await lookupHandle('user.bsky.social');

    expect(result.exists).toBe(false);
    expect(apiCache.setApiCache).not.toHaveBeenCalled();
  });
});
