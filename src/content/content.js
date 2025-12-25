import './styles.css';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { createDOMObserver } from './dom-observer.js';
import { createBadge, updateBadgeState, badgeExistsFor, injectBadge } from './badge-injector.js';

const processedImages = new Set();
const pendingHandles = new Set();
let ocrWorker = null;
let ocrReady = false;
const ocrQueue = [];

function initOCRWorker() {
  const workerUrl = chrome.runtime.getURL('src/worker/ocr-worker.js');
  ocrWorker = new Worker(workerUrl, { type: 'module' });

  ocrWorker.onmessage = (e) => {
    const { type, payload } = e.data;

    if (type === 'ready') {
      ocrReady = true;
      processOCRQueue();
      return;
    }

    if (type === 'result') {
      payload.handles.forEach(handle => {
        handleDetected(handle, null);
      });
      processOCRQueue();
    }
  };

  ocrWorker.postMessage({ type: 'init' });
}

function processOCRQueue() {
  if (!ocrReady || ocrQueue.length === 0) return;

  const imageUrl = ocrQueue.shift();
  ocrWorker.postMessage({ type: 'process', payload: { imageUrl } });
}

function queueImageForOCR(imageUrl) {
  if (processedImages.has(imageUrl)) return;
  processedImages.add(imageUrl);

  if (processedImages.size > 1000) {
    const first = processedImages.values().next().value;
    processedImages.delete(first);
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push(imageUrl);
    processOCRQueue();
  }
}

async function handleDetected(handle, targetElement) {
  if (pendingHandles.has(handle)) {
    return;
  }

  if (targetElement && !badgeExistsFor(handle, targetElement.closest('article') || document)) {
    const badge = createBadge(handle);
    injectBadge(badge, targetElement);
  }

  pendingHandles.add(handle);

  try {
    const result = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle },
    });

    if (result && !result.error) {
      updateBadgeState(handle, result.exists);
    }
  } catch (error) {
    console.error('Xscape Hatch: verification error', error);
  }

  pendingHandles.delete(handle);
}

function onTweetFound({ article, blueskyHandles, twitterHandles, images }) {
  blueskyHandles.forEach(handle => {
    const targetElement = findBestTargetElement(article, handle);
    if (targetElement) {
      handleDetected(handle, targetElement);
    }
  });

  twitterHandles.forEach(({ element, inferredBluesky }) => {
    handleDetected(inferredBluesky, element);
  });

  images.forEach(url => {
    queueImageForOCR(url);
  });
}

function findBestTargetElement(article, handle) {
  const links = article.querySelectorAll('a[href^="/"]');
  for (const link of links) {
    if (link.textContent?.startsWith('@')) {
      return link;
    }
  }
  return null;
}

const observer = createDOMObserver(onTweetFound);
observer.start();
initOCRWorker();
