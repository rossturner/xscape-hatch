import './styles.css';
import { MESSAGE_TYPES } from '../shared/constants';
import { createDOMObserver } from './dom-observer';
import {
  loadMappingCache,
  getMapping,
  saveMapping,
  updateMappingVerification,
  shouldOverwriteMapping,
} from '../shared/mapping-cache';
import {
  createBadge,
  updateBadgeState,
  badgeExistsFor,
  injectBadge,
} from './badge-injector';
import type {
  TweetData,
  WorkerOutgoingMessage,
  VerifyHandleResponse,
  TwitterBlueskyMapping,
} from '../types';

const processedImages = new Set<string>();
const pendingVerifications = new Set<string>();
let ocrWorker: Worker | null = null;
let ocrReady = false;
const ocrQueue: Array<{ imageUrl: string; twitterHandle: string }> = [];

async function init(): Promise<void> {
  await loadMappingCache();
  const observer = createDOMObserver(onTweetFound);
  observer.start();
  initOCRWorker();
}

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

    if (message.type === 'result' && message.id) {
      const twitterHandle = message.id;
      message.payload.handles.forEach((blueskyHandle) => {
        handleBlueskyDiscovered(twitterHandle, blueskyHandle, 'image');
      });
      processOCRQueue();
    }
  };

  ocrWorker.postMessage({ type: 'init' });
}

function processOCRQueue(): void {
  if (!ocrReady || ocrQueue.length === 0) return;

  const { imageUrl, twitterHandle } = ocrQueue.shift()!;
  ocrWorker?.postMessage({
    type: 'process',
    id: twitterHandle,
    payload: { imageUrl },
  });
}

function queueImageForOCR(imageUrl: string, twitterHandle: string): void {
  if (processedImages.has(imageUrl)) return;
  processedImages.add(imageUrl);

  if (processedImages.size > 1000) {
    const first = processedImages.values().next().value;
    if (first) processedImages.delete(first);
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push({ imageUrl, twitterHandle });
    processOCRQueue();
  }
}

async function handleBlueskyDiscovered(
  twitterHandle: string,
  blueskyHandle: string,
  source: 'text' | 'image' | 'inferred'
): Promise<void> {
  const existing = getMapping(twitterHandle);

  if (existing) {
    if (!shouldOverwriteMapping(existing, source)) {
      return;
    }
  }

  const mapping: TwitterBlueskyMapping = {
    twitterHandle: twitterHandle.toLowerCase(),
    blueskyHandle: blueskyHandle.toLowerCase(),
    verified: false,
    displayName: null,
    discoveredAt: Date.now(),
    source,
  };

  await saveMapping(mapping);
  await verifyAndUpdateBadges(twitterHandle);
}

async function verifyAndUpdateBadges(twitterHandle: string): Promise<void> {
  const mapping = getMapping(twitterHandle);
  if (!mapping) return;

  if (mapping.verified) {
    refreshBadgesForTwitterHandle(twitterHandle, mapping);
    return;
  }

  if (pendingVerifications.has(mapping.blueskyHandle)) {
    return;
  }

  pendingVerifications.add(mapping.blueskyHandle);

  try {
    const result: VerifyHandleResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle: mapping.blueskyHandle },
    });

    if (result && !result.error) {
      await updateMappingVerification(
        twitterHandle,
        result.exists === true,
        result.displayName
      );

      const updatedMapping = getMapping(twitterHandle);
      if (updatedMapping) {
        refreshBadgesForTwitterHandle(twitterHandle, updatedMapping);
      }
    }
  } catch (error) {
    console.error('Xscape Hatch: verification error', error);
  } finally {
    pendingVerifications.delete(mapping.blueskyHandle);
  }
}

function refreshBadgesForTwitterHandle(
  twitterHandle: string,
  mapping: TwitterBlueskyMapping
): void {
  const articles = document.querySelectorAll<HTMLElement>('article');

  for (const article of articles) {
    const authorLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');

    for (const link of authorLinks) {
      const href = link.getAttribute('href');
      if (!href) continue;

      const pathPart = href.slice(1).split('/')[0].split('?')[0];
      if (pathPart.toLowerCase() !== twitterHandle.toLowerCase()) continue;

      const text = link.textContent || '';
      if (!text.startsWith('@') && !link.querySelector('img[src*="profile_images"]')) {
        continue;
      }

      if (badgeExistsFor(mapping.blueskyHandle, article)) {
        updateBadgeState(mapping.blueskyHandle, mapping.verified && mapping.displayName !== null);
      } else if (mapping.verified) {
        const badge = createBadge(mapping.blueskyHandle);
        injectBadge(badge, link);
        updateBadgeState(mapping.blueskyHandle, true);
      }

      break;
    }
  }
}

function onTweetFound({ article, author, blueskyHandles, twitterHandles, images }: TweetData): void {
  if (!author) {
    blueskyHandles.forEach((handle) => {
      twitterHandles.forEach(({ element, twitterHandle }) => {
        handleBlueskyDiscovered(twitterHandle, handle, 'text');
      });
    });

    twitterHandles.forEach(({ twitterHandle, inferredBluesky }) => {
      handleBlueskyDiscovered(twitterHandle, inferredBluesky, 'inferred');
    });

    return;
  }

  const existingMapping = getMapping(author.twitterHandle);

  if (existingMapping?.verified) {
    if (!badgeExistsFor(existingMapping.blueskyHandle, article)) {
      const badge = createBadge(existingMapping.blueskyHandle);
      injectBadge(badge, author.authorElement);
      updateBadgeState(existingMapping.blueskyHandle, true);
    }
    return;
  }

  if (existingMapping && !existingMapping.verified) {
    if (!badgeExistsFor(existingMapping.blueskyHandle, article)) {
      const badge = createBadge(existingMapping.blueskyHandle);
      injectBadge(badge, author.authorElement);
    }
    verifyAndUpdateBadges(author.twitterHandle);
    return;
  }

  if (blueskyHandles.length > 0) {
    handleBlueskyDiscovered(author.twitterHandle, blueskyHandles[0], 'text');
    return;
  }

  images.forEach((imageUrl) => {
    queueImageForOCR(imageUrl, author.twitterHandle);
  });

  twitterHandles.forEach(({ twitterHandle, inferredBluesky }) => {
    if (twitterHandle.toLowerCase() === author.twitterHandle.toLowerCase()) {
      handleBlueskyDiscovered(author.twitterHandle, inferredBluesky, 'inferred');
    }
  });
}

init();
