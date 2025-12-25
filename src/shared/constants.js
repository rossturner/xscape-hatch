export const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

export const TWITTER_HANDLE_REGEX = /@([a-zA-Z0-9_]{1,15})/g;

export const SELECTORS = {
  article: 'article',
  tweetText: '[data-testid="tweetText"]',
  userNameFallback: 'a[href^="/"]',
};

export const BLUESKY_API = {
  profileUrl: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile',
  webProfileUrl: 'https://bsky.app/profile',
};

export const CACHE = {
  prefix: 'bsky:',
  existsTTL: 7 * 24 * 60 * 60 * 1000,
  notExistsTTL: 24 * 60 * 60 * 1000,
};

export const BADGE_ATTR = 'data-xscape-hatch';

export const MESSAGE_TYPES = {
  VERIFY_HANDLE: 'VERIFY_HANDLE',
  HANDLE_VERIFIED: 'HANDLE_VERIFIED',
  OCR_INIT: 'OCR_INIT',
  OCR_READY: 'OCR_READY',
  OCR_PROCESS: 'OCR_PROCESS',
  OCR_RESULT: 'OCR_RESULT',
};
