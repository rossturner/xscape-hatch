import { MESSAGE_TYPES } from './constants';
import { getApiCache, setApiCache } from './api-cache';
import { log } from './debug';
import type { ApiCacheEntry, VerifyHandleResponse } from '../types';

export async function lookupHandle(blueskyHandle: string): Promise<ApiCacheEntry> {
  const cached = await getApiCache(blueskyHandle);
  if (cached) {
    log('API', `Cache hit: ${blueskyHandle} → exists=${cached.exists}`);
    return cached;
  }

  log('API', `Looking up: ${blueskyHandle}`);

  try {
    const response: VerifyHandleResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle: blueskyHandle },
    });

    if (response?.error) {
      log('API', `Error looking up ${blueskyHandle}`);
      return { exists: false, displayName: null, checkedAt: Date.now() };
    }

    const entry: ApiCacheEntry = {
      exists: response.exists === true,
      displayName: response.displayName,
      checkedAt: Date.now(),
    };

    await setApiCache(blueskyHandle, entry);
    log('API', `${blueskyHandle}: ${entry.exists ? `✓ ${entry.displayName || 'exists'}` : '✗ not found'}`);

    return entry;
  } catch (error) {
    log('API', `Error looking up ${blueskyHandle}: ${error}`);
    return { exists: false, displayName: null, checkedAt: Date.now() };
  }
}
