import { MESSAGE_TYPES } from '../shared/constants';
import { createDOMObserver, getImageAuthor, extractProfileHeader, isProfilePage } from './dom-observer';
import { loadMappingCache, getMapping, saveMapping, shouldOverwriteMapping } from '../shared/mapping-cache';
import { getOcrCache, setOcrCache } from '../shared/ocr-cache';
import { lookupHandle } from '../shared/handle-lookup';
import { createBadge, badgeExistsFor, injectBadge, createProfileBadge, injectProfileBadge } from './badge-injector';
import { initDebug, log, exposeDebugGlobal } from '../shared/debug';
import type { TweetData, TwitterBlueskyMapping, ImageData } from '../types';

const ocrQueue: Array<{ imageUrl: string; twitterHandle: string }> = [];
let ocrProcessing = false;
let lastProcessedProfileHandle: string | null = null;
let lastUrl = window.location.href;

async function init(): Promise<void> {
  console.log('[Xscape Hatch] Content script loaded');
  await initDebug();
  exposeDebugGlobal();
  await loadMappingCache();
  const observer = createDOMObserver(onTweetFound);
  observer.start();

  watchForNavigation();
  setTimeout(processProfileHeader, 500);

  log('DOM', 'Initialized and watching for tweets');
}

function watchForNavigation(): void {
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      lastProcessedProfileHandle = null;
      setTimeout(processProfileHeader, 500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function processProfileHeader(): Promise<void> {
  if (!isProfilePage()) return;

  const header = extractProfileHeader();
  if (!header) {
    setTimeout(processProfileHeader, 500);
    return;
  }

  if (lastProcessedProfileHandle === header.twitterHandle) return;

  const existing = getMapping(header.twitterHandle);
  if (existing) {
    if (!badgeExistsFor(existing.blueskyHandle, header.handleElement.parentElement!)) {
      log('BADGE', `Injecting profile badge: @${header.twitterHandle} → ${existing.blueskyHandle}`);
      const badge = createProfileBadge(existing.blueskyHandle);
      injectProfileBadge(badge, header.handleElement);
      lastProcessedProfileHandle = header.twitterHandle;
    }
    return;
  }

  const inferredHandle = `${header.twitterHandle.toLowerCase()}.bsky.social`;
  const result = await lookupHandle(inferredHandle);

  if (result.exists) {
    const mapping: TwitterBlueskyMapping = {
      twitterHandle: header.twitterHandle.toLowerCase(),
      blueskyHandle: inferredHandle,
      displayName: result.displayName,
      source: 'inferred',
      discoveredAt: Date.now(),
    };

    await saveMapping(mapping);
    log('BADGE', `Injecting profile badge: @${header.twitterHandle} → ${inferredHandle}`);
    const badge = createProfileBadge(inferredHandle);
    injectProfileBadge(badge, header.handleElement);
    lastProcessedProfileHandle = header.twitterHandle;
  }
}

async function processOCRQueue(): Promise<void> {
  if (ocrProcessing || ocrQueue.length === 0) return;

  ocrProcessing = true;
  const { imageUrl, twitterHandle } = ocrQueue.shift()!;

  log('OCR', `Processing image for @${twitterHandle} (queue: ${ocrQueue.length})`);

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.OCR_PROCESS,
      payload: { imageUrl, requestId: `ocr-${Date.now()}` },
    });

    log('OCR', `Response for @${twitterHandle}: ${JSON.stringify(response)}`);

    const handles = response?.handles || [];
    await setOcrCache(imageUrl, handles);

    if (handles.length > 0) {
      log('OCR', `Found: ${handles.join(', ')}`);
      for (const blueskyHandle of handles) {
        await processDiscoveredHandle(twitterHandle, blueskyHandle, 'image');
      }
    }
  } catch (error) {
    log('OCR', `Error: ${error}`);
  }

  ocrProcessing = false;
  processOCRQueue();
}

async function queueImageForOCR(imageUrl: string, twitterHandle: string): Promise<void> {
  const cached = await getOcrCache(imageUrl);
  if (cached) {
    for (const handle of cached.handles) {
      await processDiscoveredHandle(twitterHandle, handle, 'image');
    }
    return;
  }

  if (ocrQueue.length < 20) {
    ocrQueue.push({ imageUrl, twitterHandle });
    processOCRQueue();
  }
}

async function processDiscoveredHandle(
  twitterHandle: string,
  blueskyHandle: string,
  source: 'text' | 'image' | 'inferred'
): Promise<void> {
  const existing = getMapping(twitterHandle);
  if (existing && !shouldOverwriteMapping(existing, source)) {
    return;
  }

  const result = await lookupHandle(blueskyHandle);
  if (!result.exists) {
    return;
  }

  const mapping: TwitterBlueskyMapping = {
    twitterHandle: twitterHandle.toLowerCase(),
    blueskyHandle: blueskyHandle.toLowerCase(),
    displayName: result.displayName,
    source,
    discoveredAt: Date.now(),
  };

  log('CACHE', `@${twitterHandle} → ${blueskyHandle} (${source}) - verified`);
  await saveMapping(mapping);
  refreshBadgesForTwitterHandle(twitterHandle, mapping);
}

function refreshBadgesForTwitterHandle(twitterHandle: string, mapping: TwitterBlueskyMapping): void {
  const articles = document.querySelectorAll<HTMLElement>('article');

  for (const article of articles) {
    if (badgeExistsFor(mapping.blueskyHandle, article)) continue;

    const authorLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
    let handleTextLink: HTMLAnchorElement | null = null;
    let profileImageLink: HTMLAnchorElement | null = null;

    for (const link of authorLinks) {
      const href = link.getAttribute('href');
      if (!href) continue;

      const pathPart = href.slice(1).split('/')[0].split('?')[0];
      if (pathPart.toLowerCase() !== twitterHandle.toLowerCase()) continue;

      const text = (link.textContent || '').trim();
      if (text.startsWith('@') && /^@[a-zA-Z0-9_]{1,15}$/.test(text)) {
        handleTextLink = link;
        break;
      }
      if (!profileImageLink && link.querySelector('img[src*="profile_images"]')) {
        profileImageLink = link;
      }
    }

    const targetLink = handleTextLink || profileImageLink;
    if (targetLink) {
      log('BADGE', `Injecting badge: @${twitterHandle} → ${mapping.blueskyHandle}`);
      const badge = createBadge(mapping.blueskyHandle);
      injectBadge(badge, targetLink);
      if (handleTextLink) {
        handleTextLink.style.display = 'none';
      }
    }
  }
}

function onTweetFound({ article, author, blueskyHandles, images }: TweetData): void {
  if (!author) return;

  const existingMapping = getMapping(author.twitterHandle);

  if (existingMapping) {
    if (!badgeExistsFor(existingMapping.blueskyHandle, article)) {
      log('BADGE', `Injecting badge: @${author.twitterHandle} → ${existingMapping.blueskyHandle}`);
      const badge = createBadge(existingMapping.blueskyHandle);
      injectBadge(badge, author.authorElement);
      const text = (author.authorElement.textContent || '').trim();
      if (text.startsWith('@') && /^@[a-zA-Z0-9_]{1,15}$/.test(text)) {
        author.authorElement.style.display = 'none';
      }
    }
    return;
  }

  if (blueskyHandles.length > 0) {
    processDiscoveredHandle(author.twitterHandle, blueskyHandles[0], 'text');
  }

  images.forEach((imageData: ImageData) => {
    const imageAuthor = getImageAuthor(imageData.element);
    const targetAuthor = imageAuthor || author.twitterHandle;
    queueImageForOCR(imageData.url, targetAuthor);
  });

  if (blueskyHandles.length === 0) {
    const inferredHandle = `${author.twitterHandle.toLowerCase()}.bsky.social`;
    processDiscoveredHandle(author.twitterHandle, inferredHandle, 'inferred');
  }
}

init();
