import { MESSAGE_TYPES } from '../shared/constants';
import Tesseract from 'tesseract.js';

let tesseractWorker: Tesseract.Worker | null = null;
let tesseractReady = false;
let debugEnabled = false;

const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

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

async function initTesseract(): Promise<void> {
  if (tesseractWorker) return;

  console.log('[Xscape:Offscreen] Initializing Tesseract...');
  try {
    const workerPath = chrome.runtime.getURL('tesseract/worker.min.js');
    const corePath = chrome.runtime.getURL('tesseract/tesseract-core-simd.wasm.js');
    console.log('[Xscape:Offscreen] Worker path:', workerPath);
    console.log('[Xscape:Offscreen] Core path:', corePath);

    tesseractWorker = await Tesseract.createWorker('eng', 1, {
      workerPath,
      corePath,
      workerBlobURL: false,
    });
    tesseractReady = true;
    console.log('[Xscape:Offscreen] Tesseract ready!');
  } catch (error) {
    console.error('[Xscape:Offscreen] Tesseract init failed:', error);
    throw error;
  }
}

async function processImage(imageUrl: string, requestId: string): Promise<string[]> {
  if (!tesseractWorker) {
    await initTesseract();
  }

  try {
    log(`Fetching image: ${imageUrl.slice(0, 60)}...`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      log(`Fetch failed: ${response.status}`);
      return [];
    }

    const blob = await response.blob();
    log(`Image: ${blob.size} bytes`);
    const imageBitmap = await createImageBitmap(blob);
    log(`Dimensions: ${imageBitmap.width}x${imageBitmap.height}`);

    const maxWidth = 1500;
    let canvas: OffscreenCanvas;
    if (imageBitmap.width > maxWidth) {
      const scale = maxWidth / imageBitmap.width;
      canvas = new OffscreenCanvas(maxWidth, imageBitmap.height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    } else {
      canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0);
    }
    imageBitmap.close();

    log('Running OCR...');
    const startTime = performance.now();
    const { data: { text, confidence } } = await tesseractWorker!.recognize(canvas);
    const duration = Math.round(performance.now() - startTime);

    log(`OCR done in ${duration}ms (confidence: ${confidence?.toFixed(1) ?? 'N/A'}%)`);

    const handles = new Set<string>();
    const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
    for (const match of matches) {
      handles.add(match[1].toLowerCase());
    }

    if (handles.size > 0) {
      log(`Found handles: ${Array.from(handles).join(', ')}`);
    }

    return Array.from(handles);
  } catch (error) {
    log(`OCR error: ${error}`);
    console.error('OCR error:', error);
    return [];
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[Xscape:Offscreen] Received message:', message.type);

  if (message.type === MESSAGE_TYPES.OCR_INIT) {
    initTesseract().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === MESSAGE_TYPES.OCR_PROCESS_INTERNAL) {
    const { imageUrl, requestId } = message.payload as { imageUrl: string; requestId: string };
    console.log('[Xscape:Offscreen] Processing OCR for:', imageUrl.slice(0, 80));
    processImage(imageUrl, requestId).then((handles) => {
      console.log('[Xscape:Offscreen] OCR complete, handles:', handles);
      sendResponse({ handles });
    }).catch((err) => {
      console.error('[Xscape:Offscreen] OCR error:', err);
      sendResponse({ handles: [] });
    });
    return true;
  }

  if (message.type === MESSAGE_TYPES.DEBUG_TOGGLE) {
    debugEnabled = message.payload.enabled;
    log(`Debug ${debugEnabled ? 'enabled' : 'disabled'}`);
    sendResponse({ success: true });
    return false;
  }

  return false;
});

if (typeof chrome !== 'undefined' && chrome.storage?.local) {
  chrome.storage.local.get('xscape:debug', (result) => {
    debugEnabled = result['xscape:debug'] === true;
  });

  if (chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['xscape:debug']) {
        debugEnabled = changes['xscape:debug'].newValue === true;
      }
    });
  }
}

console.log('[Xscape:Offscreen] Document loaded, starting Tesseract init...');
initTesseract().then(() => {
  console.log('[Xscape:Offscreen] Startup complete');
}).catch((err) => {
  console.error('[Xscape:Offscreen] Startup failed:', err);
});
