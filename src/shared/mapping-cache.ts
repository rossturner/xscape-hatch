import { MAPPING_CACHE } from './constants';
import type { TwitterBlueskyMapping } from '../types';

const memoryCache = new Map<string, TwitterBlueskyMapping>();

export async function loadMappingCache(): Promise<void> {
  const storage = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(storage)) {
    if (key.startsWith(MAPPING_CACHE.prefix)) {
      const twitterHandle = key.slice(MAPPING_CACHE.prefix.length);
      memoryCache.set(twitterHandle, value as TwitterBlueskyMapping);
    }
  }
}

export function getMapping(twitterHandle: string): TwitterBlueskyMapping | null {
  return memoryCache.get(twitterHandle.toLowerCase()) ?? null;
}

export async function saveMapping(mapping: TwitterBlueskyMapping): Promise<void> {
  const key = MAPPING_CACHE.prefix + mapping.twitterHandle.toLowerCase();
  memoryCache.set(mapping.twitterHandle.toLowerCase(), mapping);
  await chrome.storage.local.set({ [key]: mapping });
  await pruneIfNeeded();
}

export async function updateMappingVerification(
  twitterHandle: string,
  verified: boolean,
  displayName: string | null
): Promise<void> {
  const existing = getMapping(twitterHandle);
  if (existing) {
    const updated: TwitterBlueskyMapping = {
      ...existing,
      verified,
      displayName,
    };
    await saveMapping(updated);
  }
}

async function pruneIfNeeded(): Promise<void> {
  if (memoryCache.size <= MAPPING_CACHE.maxEntries) return;

  const entries = Array.from(memoryCache.entries())
    .sort((a, b) => a[1].discoveredAt - b[1].discoveredAt);

  const toRemove = entries.slice(0, memoryCache.size - MAPPING_CACHE.maxEntries);
  const keysToRemove: string[] = [];

  for (const [handle] of toRemove) {
    memoryCache.delete(handle);
    keysToRemove.push(MAPPING_CACHE.prefix + handle);
  }

  await chrome.storage.local.remove(keysToRemove);
}

export function shouldOverwriteMapping(
  existing: TwitterBlueskyMapping,
  newSource: 'text' | 'image' | 'inferred'
): boolean {
  const priority = { text: 3, image: 2, inferred: 1 };
  return priority[newSource] > priority[existing.source];
}
