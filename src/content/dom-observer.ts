import {
  SELECTORS,
  BLUESKY_HANDLE_REGEX,
  BADGE_ATTR,
} from '../shared/constants';

export interface ProfileHeaderData {
  twitterHandle: string;
  handleElement: HTMLElement;
}
import { log } from '../shared/debug';
import type { TweetData, HandleElement, TweetAuthor, ImageData, UserCellData } from '../types';

export interface DOMObserver {
  start: () => void;
  stop: () => void;
}

export interface DOMObserverCallbacks {
  onTweetFound: (data: TweetData) => void;
  onUserCellFound?: (data: UserCellData) => void;
}

export function createDOMObserver(
  callbacks: DOMObserverCallbacks | ((data: TweetData) => void)
): DOMObserver {
  const { onTweetFound, onUserCellFound } = typeof callbacks === 'function'
    ? { onTweetFound: callbacks, onUserCellFound: undefined }
    : callbacks;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const processedArticles = new WeakSet<HTMLElement>();
  const processedUserCells = new WeakSet<HTMLElement>();
  let pendingMutations: MutationRecord[] = [];

  function processArticle(article: HTMLElement): void {
    if (processedArticles.has(article)) return;
    processedArticles.add(article);

    const author = extractTweetAuthor(article);
    const handles = extractHandlesFromArticle(article);
    const images = extractImagesFromArticle(article);
    const handleElements = findHandleElements(article);

    if (author || handles.length > 0 || images.length > 0 || handleElements.length > 0) {
      log('DOM', `Article: @${author?.twitterHandle ?? '?'} | bsky:${handles.length} img:${images.length} handles:${handleElements.length}`);
      onTweetFound({
        article,
        author,
        blueskyHandles: handles,
        twitterHandles: handleElements,
        images,
      });
    }
  }

  function processUserCell(cell: HTMLElement): void {
    if (!onUserCellFound) return;
    if (processedUserCells.has(cell)) return;
    processedUserCells.add(cell);

    const userData = extractUserCellData(cell);
    if (userData) {
      log('DOM', `UserCell: @${userData.twitterHandle}`);
      onUserCellFound(userData);
    }
  }

  function scanPage(): void {
    const articles = document.querySelectorAll<HTMLElement>(SELECTORS.article);
    const userCells = document.querySelectorAll<HTMLElement>(SELECTORS.userCell);
    log('DOM', `Initial page scan: found ${articles.length} articles, ${userCells.length} user cells`);
    articles.forEach(processArticle);
    userCells.forEach(processUserCell);
  }

  function handleMutations(mutations: MutationRecord[]): void {
    pendingMutations.push(...mutations);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const toProcess = pendingMutations;
      pendingMutations = [];

      for (const mutation of toProcess) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              if (element.matches?.(SELECTORS.article)) {
                processArticle(element);
              }
              if (element.matches?.(SELECTORS.userCell)) {
                processUserCell(element);
              }
              element.querySelectorAll?.<HTMLElement>(SELECTORS.article)
                .forEach(processArticle);
              element.querySelectorAll?.<HTMLElement>(SELECTORS.userCell)
                .forEach(processUserCell);
            }
          });
        }
      }

      document.querySelectorAll<HTMLElement>(SELECTORS.article)
        .forEach((article) => {
          if (!processedArticles.has(article)) {
            processArticle(article);
          }
        });
      document.querySelectorAll<HTMLElement>(SELECTORS.userCell)
        .forEach((cell) => {
          if (!processedUserCells.has(cell)) {
            processUserCell(cell);
          }
        });
    }, 150);
  }

  const observer = new MutationObserver(handleMutations);

  return {
    start(): void {
      scanPage();
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    },
    stop(): void {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

function extractTweetAuthor(article: HTMLElement): TweetAuthor | null {
  let isRetweet = false;
  let retweetedBy: string | null = null;

  const socialContext = article.querySelector('[data-testid="socialContext"]');
  if (socialContext) {
    const text = socialContext.textContent || '';
    if (text.includes('reposted') || text.includes('Retweeted')) {
      isRetweet = true;
      const retweeterLink = socialContext.querySelector('a[href^="/"]');
      if (retweeterLink) {
        const href = retweeterLink.getAttribute('href');
        if (href) {
          retweetedBy = href.slice(1).split('/')[0].split('?')[0];
        }
      }
    }
  }

  let twitterHandle: string | null = null;
  let handleTextLink: HTMLAnchorElement | null = null;

  const userLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  for (const link of userLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;

    const pathPart = href.slice(1).split('/')[0].split('?')[0];
    if (!pathPart || pathPart === 'i' || pathPart === 'search' || pathPart === 'hashtag') {
      continue;
    }

    if (isRetweet && pathPart.toLowerCase() === retweetedBy?.toLowerCase()) {
      continue;
    }

    const text = (link.textContent || '').trim();

    if (text.startsWith('@') && /^@[a-zA-Z0-9_]{1,15}$/.test(text)) {
      return {
        twitterHandle: pathPart,
        authorElement: link,
        isRetweet,
        retweetedBy,
      };
    }

    if (!twitterHandle && link.querySelector('img[src*="profile_images"]')) {
      twitterHandle = pathPart;
      handleTextLink = link;
    }
  }

  if (twitterHandle && handleTextLink) {
    return {
      twitterHandle,
      authorElement: handleTextLink,
      isRetweet,
      retweetedBy,
    };
  }

  return null;
}

export function extractHandlesFromArticle(article: HTMLElement): string[] {
  const text = article.textContent || '';
  const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
  const handles = new Set<string>();
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

export function extractImagesFromArticle(article: HTMLElement): ImageData[] {
  const images = article.querySelectorAll<HTMLImageElement>('img');
  const results: ImageData[] = [];
  images.forEach((img) => {
    if (img.src && img.width > 100 && img.height > 100) {
      const isAvatar =
        img.closest('[data-testid="Tweet-User-Avatar"]') ||
        img.src.includes('profile_images');
      const isMedia = img.src.includes('pbs.twimg.com/media/');
      if (!isAvatar && isMedia) {
        const url = normalizeTwitterImageUrl(img.src);
        if (url) {
          results.push({ url, element: img });
        }
      }
    }
  });
  return results;
}

function normalizeTwitterImageUrl(src: string): string | null {
  try {
    const url = new URL(src);
    const format = url.searchParams.get('format');
    if (!format) {
      log('DOM', `Skipping image without format: ${src}`);
      return null;
    }
    url.searchParams.set('name', 'large');
    const result = url.toString();
    log('DOM', `Normalized URL: format=${format}, name=${url.searchParams.get('name')}`);
    return result;
  } catch (e) {
    log('DOM', `URL parse error: ${e}`);
    return null;
  }
}

export function findHandleElements(article: HTMLElement): HandleElement[] {
  const results: HandleElement[] = [];
  const links = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');

  links.forEach((link) => {
    const text = link.textContent || '';
    const match = text.match(/^@([a-zA-Z0-9_]{1,15})$/);
    if (match && !link.closest(`[${BADGE_ATTR}]`)) {
      results.push({
        element: link,
        twitterHandle: match[1],
        inferredBluesky: `${match[1].toLowerCase()}.bsky.social`,
      });
    }
  });

  return results;
}

export function getImageAuthor(imageElement: HTMLImageElement): string | null {
  const imgLink = imageElement.closest('a[href*="/status/"]');
  const statusUrl = imgLink?.getAttribute('href');

  if (statusUrl) {
    const author = statusUrl.split('/')[1];
    if (author && author !== 'i' && author !== 'search') {
      return author;
    }
  }

  return null;
}

export function extractProfileHeader(): ProfileHeaderData | null {
  const userNameEl = document.querySelector<HTMLElement>(SELECTORS.profileUserName);
  if (!userNameEl) return null;

  const spans = userNameEl.querySelectorAll<HTMLSpanElement>('span');
  for (const span of spans) {
    const text = span.textContent || '';
    const match = text.match(/^@([a-zA-Z0-9_]{1,15})$/);
    if (match && !span.closest(`[${BADGE_ATTR}]`)) {
      return {
        twitterHandle: match[1],
        handleElement: span,
      };
    }
  }

  return null;
}

export function isProfilePage(): boolean {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 1 && parts[0] !== 'home' && parts[0] !== 'explore' &&
      parts[0] !== 'notifications' && parts[0] !== 'messages' && parts[0] !== 'i' &&
      parts[0] !== 'search' && parts[0] !== 'settings' && parts[0] !== 'compose') {
    return true;
  }
  return false;
}

export function extractUserCellData(cell: HTMLElement): UserCellData | null {
  const links = cell.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');

  for (const link of links) {
    const text = (link.textContent || '').trim();
    const match = text.match(/^@([a-zA-Z0-9_]{1,15})$/);
    if (match && !link.closest(`[${BADGE_ATTR}]`)) {
      return {
        cell,
        twitterHandle: match[1],
        handleElement: link,
      };
    }
  }

  return null;
}
