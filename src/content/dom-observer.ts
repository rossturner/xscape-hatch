import {
  SELECTORS,
  BLUESKY_HANDLE_REGEX,
  BADGE_ATTR,
} from '../shared/constants';
import type { TweetData, HandleElement } from '../types';

export interface DOMObserver {
  start: () => void;
  stop: () => void;
}

export function createDOMObserver(
  onTweetFound: (data: TweetData) => void
): DOMObserver {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const processedArticles = new WeakSet<HTMLElement>();

  function processArticle(article: HTMLElement): void {
    if (processedArticles.has(article)) return;
    processedArticles.add(article);

    const handles = extractHandlesFromArticle(article);
    const images = extractImagesFromArticle(article);
    const handleElements = findHandleElements(article);

    if (handles.length > 0 || images.length > 0 || handleElements.length > 0) {
      onTweetFound({
        article,
        blueskyHandles: handles,
        twitterHandles: handleElements,
        images,
      });
    }
  }

  function scanPage(): void {
    const articles = document.querySelectorAll<HTMLElement>(SELECTORS.article);
    articles.forEach(processArticle);
  }

  function handleMutations(mutations: MutationRecord[]): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              if (element.matches?.(SELECTORS.article)) {
                processArticle(element);
              }
              element
                .querySelectorAll?.<HTMLElement>(SELECTORS.article)
                .forEach(processArticle);
            }
          });
        }
      }
    }, 100);
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

function extractHandlesFromArticle(article: HTMLElement): string[] {
  const text = article.textContent || '';
  const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
  const handles = new Set<string>();
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

function extractImagesFromArticle(article: HTMLElement): string[] {
  const images = article.querySelectorAll<HTMLImageElement>('img');
  const urls: string[] = [];
  images.forEach((img) => {
    if (img.src && img.width > 100 && img.height > 100) {
      const isAvatar =
        img.closest('[data-testid="Tweet-User-Avatar"]') ||
        img.src.includes('profile_images');
      if (!isAvatar) {
        urls.push(img.src);
      }
    }
  });
  return urls;
}

function findHandleElements(article: HTMLElement): HandleElement[] {
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
