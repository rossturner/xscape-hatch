import { BLUESKY_API } from '../shared/constants';
import { log } from '../shared/debug';

interface BlueskyProfileResponse {
  displayName?: string;
}

interface VerificationResult {
  exists: boolean;
  displayName: string | null;
}

export async function verifyBlueskyProfile(
  handle: string
): Promise<VerificationResult | null> {
  try {
    const url = `${BLUESKY_API.profileUrl}?actor=${encodeURIComponent(handle)}`;
    log('API', `Fetching profile: ${handle}`);
    const response = await fetch(url);

    if (response.ok) {
      const data: BlueskyProfileResponse = await response.json();
      log('API', `Profile found: ${handle} → displayName=${data.displayName ?? 'none'}`);
      return {
        exists: true,
        displayName: data.displayName || null,
      };
    }

    if (response.status === 400) {
      log('API', `Profile not found: ${handle}`);
      return { exists: false, displayName: null };
    }

    log('API', `Unexpected response for ${handle}: ${response.status}`);
    return null;
  } catch (error) {
    log('API', `Error fetching ${handle}`, error);
    console.error('Xscape Hatch: API error', error);
    return null;
  }
}
