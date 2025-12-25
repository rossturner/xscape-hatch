import { vi } from 'vitest';

export function createMockTesseractWorker(ocrText: string) {
  return {
    recognize: vi.fn().mockResolvedValue({
      data: { text: ocrText },
    }),
    terminate: vi.fn().mockResolvedValue(undefined),
  };
}
