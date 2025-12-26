import {
  SELECTORS,
  BLUESKY_HANDLE_REGEX,
  BADGE_ATTR,
} from '../shared/constants';
import { log } from '../shared/debug';
import type { TweetData, HandleElement, TweetAuthor, ImageData } from '../types';

export interface DOMObserver {
  start: () => void;
  stop: () => void;
}

export function createDOMObserver(
  onTweetFound: (data: TweetData) => void
): DOMObserver {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const processedArticles = new WeakSet<HTMLElement>();
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

  function scanPage(): void {
    const articles = document.querySelectorAll<HTMLElement>(SELECTORS.article);
    log('DOM', `Initial page scan: found ${articles.length} articles`);
    articles.forEach(processArticle);
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
              element.querySelectorAll?.<HTMLElement>(SELECTORS.article)
                .forEach(processArticle);
            }
          });
        }
      }

      // Re-scan to catch React-rendered content mutations might miss
      document.querySelectorAll<HTMLElement>(SELECTORS.article)
        .forEach((article) => {
          if (!processedArticles.has(article)) {
            processArticle(article);
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

  const userLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  for (const link of userLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;

    const pathPart = href.slice(1).split('/')[0].split('?')[0];
    if (!pathPart || pathPart === 'i' || pathPart === 'search' || pathPart === 'hashtag') {
      continue;
    }

    const text = link.textContent || '';
    if (text.startsWith('@') || link.querySelector('img[src*="profile_images"]')) {
      if (isRetweet && pathPart.toLowerCase() === retweetedBy?.toLowerCase()) {
        continue;
      }

      return {
        twitterHandle: pathPart,
        authorElement: link,
        isRetweet,
        retweetedBy,
      };
    }
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
      if (!isAvatar) {
        results.push({ url: img.src, element: img });
      }
    }
  });
  return results;
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
