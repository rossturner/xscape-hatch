import { MESSAGE_TYPES } from '../shared/constants';
import { getCachedHandle, setCachedHandle, pruneCache } from './cache';
import { verifyBlueskyProfile } from './bluesky-api';
import { initDebug, log, isDebugEnabled, setDebugEnabled, exposeDebugGlobal } from '../shared/debug';
import type { VerifyHandleResponse } from '../types';

interface IncomingMessage {
  type: string;
  payload: { handle?: string; enabled?: boolean };
}

const CONTEXT_MENU_ID = 'xscape-debug-toggle';

async function initContextMenu(): Promise<void> {
  const enabled = isDebugEnabled();
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: `Xscape Hatch: Debug ${enabled ? 'ON ✓' : 'OFF'}`,
    contexts: ['page'],
    documentUrlPatterns: ['https://x.com/*', 'https://twitter.com/*'],
  });
}

async function updateContextMenuTitle(): Promise<void> {
  const enabled = isDebugEnabled();
  chrome.contextMenus.update(CONTEXT_MENU_ID, {
    title: `Xscape Hatch: Debug ${enabled ? 'ON ✓' : 'OFF'}`,
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    const newState = !isDebugEnabled();
    await setDebugEnabled(newState);
    await updateContextMenuTitle();
    log('MSG', `Debug toggled via context menu: ${newState}`);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['xscape:debug']) {
    updateContextMenuTitle();
  }
});

const pendingVerifications = new Map<string, Promise<VerifyHandleResponse>>();

chrome.runtime.onMessage.addListener(
  (message: IncomingMessage, sender, sendResponse) => {
    if (message.type === MESSAGE_TYPES.VERIFY_HANDLE && message.payload.handle) {
      log('MSG', `Received VERIFY_HANDLE for ${message.payload.handle}`);
      handleVerification(message.payload.handle, sender.tab?.id).then(sendResponse);
      return true;
    }
    if (message.type === MESSAGE_TYPES.DEBUG_TOGGLE) {
      const enabled = message.payload.enabled ?? !isDebugEnabled();
      setDebugEnabled(enabled).then(() => {
        log('MSG', `Debug toggled via message: ${enabled}`);
        sendResponse({ enabled });
      });
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
    log('CACHE', `Verification cache hit: ${handle} → exists=${cached.exists}`);
    return { handle, exists: cached.exists, displayName: cached.displayName };
  }

  if (pendingVerifications.has(handle)) {
    log('MSG', `Verification already pending: ${handle}`);
    return pendingVerifications.get(handle)!;
  }

  log('API', `Verifying handle: ${handle}`);
  const verificationPromise = (async (): Promise<VerifyHandleResponse> => {
    const result = await verifyBlueskyProfile(handle);

    if (result !== null) {
      log('API', `Verification result: ${handle} → exists=${result.exists}, displayName=${result.displayName}`);
      await setCachedHandle(handle, result.exists, result.displayName);
      pendingVerifications.delete(handle);
      return { handle, exists: result.exists, displayName: result.displayName };
    }

    log('API', `Verification error: ${handle}`);
    pendingVerifications.delete(handle);
    return { handle, exists: null, displayName: null, error: true };
  })();

  pendingVerifications.set(handle, verificationPromise);
  return verificationPromise;
}

chrome.runtime.onInstalled.addListener(async () => {
  await initDebug();
  await initContextMenu();
  pruneCache();
  log('MSG', 'Extension installed/updated');
});

chrome.runtime.onStartup.addListener(async () => {
  await initDebug();
  await initContextMenu();
  log('MSG', 'Service worker started');
});

initDebug().then(() => {
  exposeDebugGlobal();
  log('MSG', 'Service worker initialized');
});
