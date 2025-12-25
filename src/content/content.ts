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
import { initDebug, log, exposeDebugGlobal } from '../shared/debug';
import type {
  TweetData,
  VerifyHandleResponse,
  TwitterBlueskyMapping,
} from '../types';

const processedImages = new Set<string>();
const pendingVerifications = new Set<string>();
const ocrQueue: Array<{ imageUrl: string; twitterHandle: string }> = [];
let ocrProcessing = false;
let requestIdCounter = 0;

async function init(): Promise<void> {
  console.log('[Xscape Hatch] Content script loaded');
  await initDebug();
  exposeDebugGlobal();
  log('DOM', 'Content script initializing');
  await loadMappingCache();
  const observer = createDOMObserver(onTweetFound);
  observer.start();
  log('DOM', 'MutationObserver started');
}

async function processOCRQueue(): Promise<void> {
  if (ocrProcessing || ocrQueue.length === 0) return;

  ocrProcessing = true;
  const { imageUrl, twitterHandle } = ocrQueue.shift()!;
  const requestId = `ocr-${++requestIdCounter}`;

  log('OCR', `Processing image for @${twitterHandle}`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OCR_PROCESS,
      payload: { imageUrl, requestId },
    });

    const handles = response?.handles || [];
    log('OCR', `Result for @${twitterHandle}: ${handles.length > 0 ? handles.join(', ') : 'no handles found'}`);

    for (const blueskyHandle of handles) {
      handleBlueskyDiscovered(twitterHandle, blueskyHandle, 'image');
    }
  } catch (error) {
    log('OCR', `Error processing image for @${twitterHandle}`, error);
  }

  ocrProcessing = false;
  processOCRQueue();
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
    log('OCR', `Queued image for @${twitterHandle} (queue size: ${ocrQueue.length})`);
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
      log('CACHE', `Skipping ${source} discovery for @${twitterHandle} (existing ${existing.source} mapping)`);
      return;
    }
  }

  log('CACHE', `Discovered @${twitterHandle} → ${blueskyHandle} via ${source}`);

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
    log('CACHE', `Already verified: @${twitterHandle} → ${mapping.blueskyHandle}`);
    refreshBadgesForTwitterHandle(twitterHandle, mapping);
    return;
  }

  if (pendingVerifications.has(mapping.blueskyHandle)) {
    log('MSG', `Verification pending: ${mapping.blueskyHandle}`);
    return;
  }

  pendingVerifications.add(mapping.blueskyHandle);
  log('MSG', `Sending verification request: ${mapping.blueskyHandle}`);

  try {
    const result: VerifyHandleResponse = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.VERIFY_HANDLE,
      payload: { handle: mapping.blueskyHandle },
    });

    if (result && !result.error) {
      log('MSG', `Verification response: ${mapping.blueskyHandle} → exists=${result.exists}`);
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
    log('MSG', `Verification error: ${mapping.blueskyHandle}`, error);
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
        updateBadgeState(mapping.blueskyHandle, mapping.verified);
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
  log('DOM', `Tweet found: author=${author?.twitterHandle ?? 'none'}, bskyHandles=${blueskyHandles.length}, images=${images.length}`);

  if (!author) {
    blueskyHandles.forEach((handle) => {
      twitterHandles.forEach(({ twitterHandle }) => {
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
    log('CACHE', `Mapping hit: @${author.twitterHandle} → ${existingMapping.blueskyHandle} (verified)`);
    if (!badgeExistsFor(existingMapping.blueskyHandle, article)) {
      const badge = createBadge(existingMapping.blueskyHandle);
      injectBadge(badge, author.authorElement);
      updateBadgeState(existingMapping.blueskyHandle, true);
    }
    return;
  }

  if (existingMapping && !existingMapping.verified) {
    log('CACHE', `Mapping hit: @${author.twitterHandle} → ${existingMapping.blueskyHandle} (unverified)`);
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

  log('CACHE', `Mapping miss: @${author.twitterHandle}`);

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
