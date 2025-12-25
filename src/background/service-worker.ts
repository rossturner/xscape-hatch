import { MESSAGE_TYPES } from '../shared/constants';
import { getCachedHandle, setCachedHandle, pruneCache } from './cache';
import { verifyBlueskyProfile } from './bluesky-api';
import type { VerifyHandleResponse } from '../types';

interface IncomingMessage {
  type: string;
  payload: { handle: string };
}

const pendingVerifications = new Map<string, Promise<VerifyHandleResponse>>();

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, sender, sendResponse) => {
    if (message.type === MESSAGE_TYPES.VERIFY_HANDLE) {
      handleVerification(message.payload.handle, sender.tab?.id).then(sendResponse);
      return true;
    }
    return false;
  }
);

async function handleVerification(
  handle: string,
  _tabId?: number
): Promise<VerifyHandleResponse> {
  const cached = await getCachedHandle(handle);
  if (cached !== null) {
    return { handle, exists: cached.exists, displayName: cached.displayName };
  }

  if (pendingVerifications.has(handle)) {
    return pendingVerifications.get(handle)!;
  }

  const verificationPromise = (async (): Promise<VerifyHandleResponse> => {
    const result = await verifyBlueskyProfile(handle);

    if (result !== null) {
      await setCachedHandle(handle, result.exists, result.displayName);
      pendingVerifications.delete(handle);
      return { handle, exists: result.exists, displayName: result.displayName };
    }

    pendingVerifications.delete(handle);
    return { handle, exists: null, displayName: null, error: true };
  })();

  pendingVerifications.set(handle, verificationPromise);
  return verificationPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  pruneCache();
});
