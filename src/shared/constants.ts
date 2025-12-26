export const BLUESKY_HANDLE_REGEX = /@?([a-zA-Z0-9_-]+\.bsky\.social)/gi;

export const TWITTER_HANDLE_REGEX = /@([a-zA-Z0-9_]{1,15})/g;

export const SELECTORS = {
  article: 'article',
  tweetText: '[data-testid="tweetText"]',
  userNameFallback: 'a[href^="/"]',
} as const;

export const BLUESKY_API = {
  profileUrl: 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile',
  webProfileUrl: 'https://bsky.app/profile',
} as const;

export const API_CACHE = {
  prefix: 'xscape:api:',
  ttl: 24 * 60 * 60 * 1000, // 24 hours
  maxEntries: 10000,
} as const;

export const OCR_CACHE = {
  prefix: 'xscape:ocr:',
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxEntries: 10000,
} as const;

export const MAPPING_CACHE = {
  prefix: 'xscape:mapping:',
  maxEntries: 20000,
} as const;

export const BADGE_ATTR = 'data-xscape-hatch';

export const MESSAGE_TYPES = {
  VERIFY_HANDLE: 'VERIFY_HANDLE',
  HANDLE_VERIFIED: 'HANDLE_VERIFIED',
  OCR_INIT: 'OCR_INIT',
  OCR_READY: 'OCR_READY',
  OCR_PROCESS: 'OCR_PROCESS',
  OCR_PROCESS_INTERNAL: 'OCR_PROCESS_INTERNAL',
  OCR_RESULT: 'OCR_RESULT',
  DEBUG_TOGGLE: 'DEBUG_TOGGLE',
} as const;
