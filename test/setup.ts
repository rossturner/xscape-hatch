import chrome from 'vitest-chrome';
import { vi, beforeEach } from 'vitest';

Object.assign(globalThis, { chrome });

beforeEach(() => {
  vi.clearAllMocks();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  chrome.storage.local.remove.mockResolvedValue(undefined);
});
