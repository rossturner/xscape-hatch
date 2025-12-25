import { BLUESKY_API } from '../shared/constants.js';

export async function verifyBlueskyProfile(handle) {
  try {
    const url = `${BLUESKY_API.profileUrl}?actor=${encodeURIComponent(handle)}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      return {
        exists: true,
        displayName: data.displayName || null,
      };
    }

    if (response.status === 400) {
      return { exists: false, displayName: null };
    }

    return null;
  } catch (error) {
    console.error('Twitter Escape: API error', error);
    return null;
  }
}
