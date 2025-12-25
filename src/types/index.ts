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

export interface TweetData {
  article: HTMLElement;
  blueskyHandles: string[];
  twitterHandles: HandleElement[];
  images: string[];
}

export interface HandleElement {
  element: HTMLAnchorElement;
  twitterHandle: string;
  inferredBluesky: string;
}

export type WorkerIncomingMessage =
  | { type: 'init'; id?: string }
  | { type: 'process'; id?: string; payload: { imageUrl: string } }
  | { type: 'terminate' };

export type WorkerOutgoingMessage =
  | { type: 'ready'; id?: string }
  | { type: 'result'; id?: string; payload: { imageUrl: string; handles: string[] } };
