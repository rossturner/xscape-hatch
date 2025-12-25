import { MESSAGE_TYPES } from '../shared/constants.js';
import { getCachedHandle, setCachedHandle, pruneCache } from './cache.js';
import { verifyBlueskyProfile } from './bluesky-api.js';

const pendingVerifications = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.VERIFY_HANDLE) {
    handleVerification(message.payload.handle, sender.tab?.id)
      .then(sendResponse);
    return true;
  }
});

async function handleVerification(handle, tabId) {
  const cached = await getCachedHandle(handle);
  if (cached !== null) {
    return { handle, exists: cached.exists, displayName: cached.displayName };
  }

  if (pendingVerifications.has(handle)) {
    return pendingVerifications.get(handle);
  }

  const verificationPromise = (async () => {
    const result = await verifyBlueskyProfile(handle);

    if (result !== null) {
      await setCachedHandle(handle, result.exists, result.displayName);
      pendingVerifications.delete(handle);
      return { handle, exists: result.exists, displayName: result.displayName };
    }

    pendingVerifications.delete(handle);
    return { handle, exists: null, error: true };
  })();

  pendingVerifications.set(handle, verificationPromise);
  return verificationPromise;
}

chrome.runtime.onInstalled.addListener(() => {
  pruneCache();
});
