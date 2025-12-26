import { MESSAGE_TYPES } from '../shared/constants';
import type { WorkerOutgoingMessage } from '../types';

let ocrWorker: Worker | null = null;
let ocrReady = false;
let debugEnabled = false;

interface PendingRequest {
  imageUrl: string;
  resolve: (handles: string[]) => void;
}
const pendingRequests = new Map<string, PendingRequest>();

function log(message: string, ...data: unknown[]): void {
  if (!debugEnabled) return;
  if (data.length > 0) {
    console.log('[Xscape:Offscreen]', message, ...data);
  } else {
    console.log('[Xscape:Offscreen]', message);
  }
}

function initOCRWorker(): void {
  if (ocrWorker) {
    return;
  }

  log('Initializing OCR worker');
  const workerUrl = chrome.runtime.getURL('worker/ocr-worker.js');
  ocrWorker = new Worker(workerUrl, { type: 'module' });

  ocrWorker.onmessage = (e: MessageEvent<WorkerOutgoingMessage>) => {
    const message = e.data;

    if (message.type === 'ready') {
      ocrReady = true;
      log('OCR worker ready');
      ocrWorker?.postMessage({ type: 'debug', payload: { enabled: debugEnabled } });
      return;
    }

    if (message.type === 'result' && message.id) {
      const requestId = message.id;
      const handles = message.payload.handles;
      log(`OCR result for ${requestId}: ${handles.length > 0 ? handles.join(', ') : 'no handles'}`);

      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(handles);
        pendingRequests.delete(requestId);
      }
    }
  };

  ocrWorker.onerror = (e) => {
    log('OCR worker error', e);
    console.error('Xscape Hatch: OCR worker error', e);
  };

  ocrWorker.postMessage({ type: 'init' });
}

async function processImage(imageUrl: string, requestId: string): Promise<string[]> {
  if (!ocrWorker) {
    initOCRWorker();
  }

  return new Promise((resolve) => {
    pendingRequests.set(requestId, { imageUrl, resolve });

    const checkAndSend = () => {
      if (ocrReady) {
        log(`Processing image: ${imageUrl.slice(0, 50)}...`);
        ocrWorker?.postMessage({
          type: 'process',
          id: requestId,
          payload: { imageUrl },
        });
      } else {
        setTimeout(checkAndSend, 100);
      }
    };
    checkAndSend();
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.OCR_INIT) {
    initOCRWorker();
    sendResponse({ success: true });
    return false;
  }

  if (message.type === MESSAGE_TYPES.OCR_PROCESS) {
    const { imageUrl, requestId } = message.payload as { imageUrl: string; requestId: string };
    processImage(imageUrl, requestId).then((handles) => {
      sendResponse({ handles });
    });
    return true;
  }

  if (message.type === MESSAGE_TYPES.DEBUG_TOGGLE) {
    debugEnabled = message.payload.enabled;
    log(`Debug ${debugEnabled ? 'enabled' : 'disabled'}`);
    ocrWorker?.postMessage({ type: 'debug', payload: { enabled: debugEnabled } });
    sendResponse({ success: true });
    return false;
  }

  return false;
});

chrome.storage.local.get('xscape:debug', (result) => {
  debugEnabled = result['xscape:debug'] === true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['xscape:debug']) {
    debugEnabled = changes['xscape:debug'].newValue === true;
    ocrWorker?.postMessage({ type: 'debug', payload: { enabled: debugEnabled } });
  }
});

initOCRWorker();
log('Offscreen document loaded');
