import { MESSAGE_TYPES } from '../shared/constants';
import { getCachedHandle, setCachedHandle, pruneCache } from './cache';
import { verifyBlueskyProfile } from './bluesky-api';
import { initDebug, log, isDebugEnabled, setDebugEnabled, exposeDebugGlobal } from '../shared/debug';
import type { VerifyHandleResponse } from '../types';

interface IncomingMessage {
  type: string;
  payload: { handle?: string; enabled?: boolean; imageUrl?: string; requestId?: string };
}

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creatingOffscreenDocument: Promise<void> | null = null;

async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
  });
  return contexts.length > 0;
}

async function setupOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  try {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'OCR processing with Tesseract.js web worker',
    });

    await creatingOffscreenDocument;
    creatingOffscreenDocument = null;
    log('MSG', 'Offscreen document created');
  } catch (error) {
    creatingOffscreenDocument = null;
    throw error;
  }
}

async function processOCR(imageUrl: string, requestId: string): Promise<string[]> {
  console.log('[Xscape:SW] processOCR starting for:', imageUrl.slice(0, 60));
  await setupOffscreenDocument();
  console.log('[Xscape:SW] Offscreen document ready, sending OCR_PROCESS_INTERNAL');

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OCR_PROCESS_INTERNAL,
      payload: { imageUrl, requestId },
    });
    console.log('[Xscape:SW] Got OCR response:', response);
    return response?.handles || [];
  } catch (error) {
    console.error('[Xscape:SW] OCR error:', error);
    return [];
  }
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
    if (message.type === MESSAGE_TYPES.OCR_PROCESS && message.payload.imageUrl && message.payload.requestId) {
      log('MSG', `Received OCR_PROCESS for ${message.payload.imageUrl.slice(0, 50)}...`);
      processOCR(message.payload.imageUrl, message.payload.requestId).then((handles) => {
        sendResponse({ handles });
      });
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
    return { handle, exists: cached.exists, displayName: cached.displayName };
  }

  if (pendingVerifications.has(handle)) {
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
