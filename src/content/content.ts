import './styles.css';
import { MESSAGE_TYPES } from '../shared/constants';
import { createDOMObserver } from './dom-observer';
import {
  createBadge,
  updateBadgeState,
  badgeExistsFor,
  injectBadge,
} from './badge-injector';
import type { TweetData, WorkerOutgoingMessage, VerifyHandleResponse } from '../types';

const processedImages = new Set<string>();
const pendingHandles = new Set<string>();
let ocrWorker: Worker | null = null;
let ocrReady = false;
const ocrQueue: string[] = [];

function initOCRWorker(): void {
  const workerUrl = chrome.runtime.getURL('src/worker/ocr-worker.js');
  ocrWorker = new Worker(workerUrl, { type: 'module' });

  ocrWorker.onmessage = (e: MessageEvent<WorkerOutgoingMessage>) => {
    const message = e.data;

    if (message.type === 'ready') {
      ocrReady = true;
      processOCRQueue();
      return;
    }

    if (message.type === 'result') {
      message.payload.handles.forEach((handle) => {
        handleDetected(handle, null);
      });
      processOCRQueue();
    }
  };

  ocrWorker.postMessage({ type: 'init' });
}

function processOCRQueue(): void {
  if (!ocrReady || ocrQueue.length === 0) return;

  const imageUrl = ocrQueue.shift()!;
  ocrWorker?.postMessage({ type: 'process', payload: { imageUrl } });
}

function queueImageForOCR(imageUrl: string): void {
  if (processedImages.has(imageUrl)) return;
  processedImages.add(imageUrl);

  if (processedImages.size > 1000) {
    const first = processedImages.values().next().value;
    if (first) processedImages.delete(first);
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push(imageUrl);
    processOCRQueue();
  }
}

async function handleDetected(
  handle: string,
  targetElement: Element | null
): Promise<void> {
  if (pendingHandles.has(handle)) {
    return;
  }

  if (
    targetElement &&
    !badgeExistsFor(handle, targetElement.closest('article') || document.body)
  ) {
    const badge = createBadge(handle);
    injectBadge(badge, targetElement);
  }

  pendingHandles.add(handle);

  try {
    const result: VerifyHandleResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle },
    });

    if (result && !result.error) {
      updateBadgeState(handle, result.exists === true);
    }
  } catch (error) {
    console.error('Xscape Hatch: verification error', error);
  }

  pendingHandles.delete(handle);
}

function onTweetFound({ article, blueskyHandles, twitterHandles, images }: TweetData): void {
  blueskyHandles.forEach((handle) => {
    const targetElement = findBestTargetElement(article, handle);
    if (targetElement) {
      handleDetected(handle, targetElement);
    }
  });

  twitterHandles.forEach(({ element, inferredBluesky }) => {
    handleDetected(inferredBluesky, element);
  });

  images.forEach((url) => {
    queueImageForOCR(url);
  });
}

function findBestTargetElement(
  article: HTMLElement,
  _handle: string
): Element | null {
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
