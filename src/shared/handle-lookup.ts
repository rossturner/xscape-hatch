import { MESSAGE_TYPES } from './constants';
import { getApiCache, setApiCache } from './api-cache';
import { log } from './debug';
import type { ApiCacheEntry, VerifyHandleResponse } from '../types';

async function sendMessageWithRetry<T>(message: unknown, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (i === retries) throw error;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}

export async function lookupHandle(blueskyHandle: string): Promise<ApiCacheEntry> {
  const cached = await getApiCache(blueskyHandle);
  if (cached) {
    return cached;
  }

  log('API', `Looking up: ${blueskyHandle}`);

  try {
    const response: VerifyHandleResponse = await sendMessageWithRetry({
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
