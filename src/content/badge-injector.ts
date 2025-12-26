import { BADGE_ATTR, BLUESKY_API } from '../shared/constants';

const BUTTERFLY_SVG = `<svg viewBox="0 0 568 501" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
<path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.89-129.52 80.986-149.071-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.659 0 75.291 0 57.946 0-28.906 76.135-1.612 123.121 33.664Z"/>
</svg>`;

export function createBadge(handle: string): HTMLAnchorElement {
  const badge = document.createElement('a');
  badge.className = 'xscape-hatch-badge';
  badge.href = `${BLUESKY_API.webProfileUrl}/${handle}`;
  badge.target = '_blank';
  badge.rel = 'noopener noreferrer';
  badge.setAttribute(BADGE_ATTR, '');
  badge.setAttribute('data-handle', handle);
  badge.setAttribute('data-verified', 'true');
  badge.innerHTML = `${BUTTERFLY_SVG}<span>@${handle}</span>`;
  return badge;
}

export function updateBadgeState(handle: string, exists: boolean): void {
  const badges = document.querySelectorAll<HTMLAnchorElement>(
    `.xscape-hatch-badge[data-handle="${handle}"]`
  );
  badges.forEach((badge) => {
    if (exists) {
      badge.setAttribute('data-verified', 'true');
    } else {
      badge.remove();
    }
  });
}

export function badgeExistsFor(handle: string, container: Element): boolean {
  return (
    container.querySelector(`.xscape-hatch-badge[data-handle="${handle}"]`) !== null
  );
}

export function injectBadge(badge: HTMLAnchorElement, targetElement: Element): void {
  const parent = targetElement.parentElement;
  const grandparent = parent?.parentElement;

  if (grandparent) {
    const grandparentStyle = window.getComputedStyle(grandparent);
    if (grandparentStyle.display === 'flex' && grandparentStyle.flexDirection === 'row') {
      grandparent.insertBefore(badge, parent);
      return;
    }
  }

  if (parent) {
    parent.insertBefore(badge, targetElement);
  }
}
