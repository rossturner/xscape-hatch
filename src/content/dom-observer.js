import { SELECTORS, BLUESKY_HANDLE_REGEX, TWITTER_HANDLE_REGEX, BADGE_ATTR } from '../shared/constants.ts';

export function createDOMObserver(onTweetFound) {
  let debounceTimer = null;
  const processedArticles = new WeakSet();

  function processArticle(article) {
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

  function scanPage() {
    const articles = document.querySelectorAll(SELECTORS.article);
    articles.forEach(processArticle);
  }

  function handleMutations(mutations) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches?.(SELECTORS.article)) {
                processArticle(node);
              }
              node.querySelectorAll?.(SELECTORS.article).forEach(processArticle);
            }
          });
        }
      }
    }, 100);
  }

  const observer = new MutationObserver(handleMutations);

  return {
    start() {
      scanPage();
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    },
    stop() {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
}

function extractHandlesFromArticle(article) {
  const text = article.textContent || '';
  const matches = text.matchAll(BLUESKY_HANDLE_REGEX);
  const handles = new Set();
  for (const match of matches) {
    handles.add(match[1].toLowerCase());
  }
  return Array.from(handles);
}

function extractImagesFromArticle(article) {
  const images = article.querySelectorAll('img');
  const urls = [];
  images.forEach(img => {
    if (img.src && img.width > 100 && img.height > 100) {
      const isAvatar = img.closest('[data-testid="Tweet-User-Avatar"]') ||
                       img.src.includes('profile_images');
      if (!isAvatar) {
        urls.push(img.src);
      }
    }
  });
  return urls;
}

function findHandleElements(article) {
  const results = [];
  const links = article.querySelectorAll('a[href^="/"]');

  links.forEach(link => {
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
