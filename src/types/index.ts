export interface VerifyHandleMessage {
  type: 'VERIFY_HANDLE';
  payload: { handle: string };
}

export interface VerifyHandleResponse {
  handle: string;
  exists: boolean | null;
  displayName: string | null;
  error?: boolean;
}

export interface CacheEntry {
  exists: boolean;
  displayName: string | null;
  checkedAt: number;
}

export interface ApiCacheEntry {
  exists: boolean;
  displayName: string | null;
  checkedAt: number;
}

export interface OcrCacheEntry {
  handles: string[];
  processedAt: number;
}

export interface ImageData {
  url: string;
  element: HTMLImageElement;
}

export interface TweetData {
  article: HTMLElement;
  author: TweetAuthor | null;
  blueskyHandles: string[];
  twitterHandles: HandleElement[];
  images: ImageData[];
}

export interface HandleElement {
  element: HTMLAnchorElement;
  twitterHandle: string;
  inferredBluesky: string;
}

export interface TwitterBlueskyMapping {
  twitterHandle: string;
  blueskyHandle: string;
  displayName: string | null;
  source: 'text' | 'image' | 'inferred';
  discoveredAt: number;
}

export interface TweetAuthor {
  twitterHandle: string;
  authorElement: HTMLElement;
  isRetweet: boolean;
  retweetedBy: string | null;
}

export interface UserCellData {
  cell: HTMLElement;
  twitterHandle: string;
  handleElement: HTMLElement;
}

export type WorkerIncomingMessage =
  | { type: 'init'; id?: string }
  | { type: 'process'; id?: string; payload: { imageUrl: string } }
  | { type: 'terminate' };

export type WorkerOutgoingMessage =
  | { type: 'ready'; id?: string }
  | { type: 'result'; id?: string; payload: { imageUrl: string; handles: string[] } };
