import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { verifyBlueskyProfile } from '../../../src/background/bluesky-api';

describe('verifyBlueskyProfile', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns exists:true with displayName for valid profile', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ displayName: 'Test User' }),
    });

    const result = await verifyBlueskyProfile('test.bsky.social');

    expect(result).toEqual({ exists: true, displayName: 'Test User' });
    expect(fetch).toHaveBeenCalledWith(
      'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=test.bsky.social'
    );
  });

  it('returns exists:true with null displayName when not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await verifyBlueskyProfile('nodisplay.bsky.social');

    expect(result).toEqual({ exists: true, displayName: null });
  });

  it('returns exists:false for 400 response (handle not found)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    });

    const result = await verifyBlueskyProfile('nonexistent.bsky.social');

    expect(result).toEqual({ exists: false, displayName: null });
  });

  it('returns null for other error status codes', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await verifyBlueskyProfile('error.bsky.social');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await verifyBlueskyProfile('network-error.bsky.social');

    expect(result).toBeNull();
  });

  it('encodes special characters in handle', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ displayName: 'Test' }),
    });

    await verifyBlueskyProfile('user+test.bsky.social');

    expect(fetch).toHaveBeenCalledWith(
      'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=user%2Btest.bsky.social'
    );
  });
});
