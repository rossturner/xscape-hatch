import { describe, it, expect, beforeEach } from 'vitest';
import {
  createBadge,
  updateBadgeState,
  badgeExistsFor,
  injectBadge,
} from '../../../src/content/badge-injector';

describe('badge-injector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('createBadge', () => {
    it('creates anchor element with correct class', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.tagName).toBe('A');
      expect(badge.className).toBe('xscape-hatch-badge');
    });

    it('sets correct href to bsky profile', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.href).toBe('https://bsky.app/profile/user.bsky.social');
    });

    it('opens in new tab', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.target).toBe('_blank');
      expect(badge.rel).toBe('noopener noreferrer');
    });

    it('sets data attributes', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.hasAttribute('data-xscape-hatch')).toBe(true);
      expect(badge.getAttribute('data-handle')).toBe('user.bsky.social');
      expect(badge.getAttribute('data-verified')).toBe('true');
    });

    it('contains SVG and handle text', () => {
      const badge = createBadge('user.bsky.social');
      expect(badge.querySelector('svg')).not.toBeNull();
      expect(badge.querySelector('span')?.textContent).toBe('@user.bsky.social');
    });
  });

  describe('updateBadgeState', () => {
    it('sets data-verified to true when exists', () => {
      const badge = createBadge('user.bsky.social');
      document.body.appendChild(badge);

      updateBadgeState('user.bsky.social', true);

      expect(badge.getAttribute('data-verified')).toBe('true');
    });

    it('removes badge when handle does not exist', () => {
      const badge = createBadge('fake.bsky.social');
      document.body.appendChild(badge);

      updateBadgeState('fake.bsky.social', false);

      expect(document.querySelector('.xscape-hatch-badge')).toBeNull();
    });

    it('updates multiple badges for same handle', () => {
      const badge1 = createBadge('user.bsky.social');
      const badge2 = createBadge('user.bsky.social');
      document.body.appendChild(badge1);
      document.body.appendChild(badge2);

      updateBadgeState('user.bsky.social', true);

      expect(badge1.getAttribute('data-verified')).toBe('true');
      expect(badge2.getAttribute('data-verified')).toBe('true');
    });
  });

  describe('badgeExistsFor', () => {
    it('returns false when no badge exists', () => {
      const container = document.createElement('div');
      expect(badgeExistsFor('user.bsky.social', container)).toBe(false);
    });

    it('returns true when badge exists in container', () => {
      const container = document.createElement('div');
      const badge = createBadge('user.bsky.social');
      container.appendChild(badge);

      expect(badgeExistsFor('user.bsky.social', container)).toBe(true);
    });

    it('returns false for different handle', () => {
      const container = document.createElement('div');
      const badge = createBadge('other.bsky.social');
      container.appendChild(badge);

      expect(badgeExistsFor('user.bsky.social', container)).toBe(false);
    });
  });

  describe('injectBadge', () => {
    it('inserts badge into grandparent row before parent column (Twitter layout)', () => {
      const grandparent = document.createElement('div');
      grandparent.style.display = 'flex';
      grandparent.style.flexDirection = 'row';

      const parent = document.createElement('div');
      parent.style.display = 'flex';
      parent.style.flexDirection = 'column';

      const target = document.createElement('a');
      target.textContent = '@handle';

      const separator = document.createElement('div');
      separator.textContent = '·';

      grandparent.appendChild(parent);
      grandparent.appendChild(separator);
      parent.appendChild(target);
      document.body.appendChild(grandparent);

      const badge = createBadge('user.bsky.social');
      injectBadge(badge, target);

      expect(grandparent.children[0]).toBe(badge);
      expect(grandparent.children[1]).toBe(parent);
      expect(grandparent.children[2]).toBe(separator);
      expect(parent.children[0]).toBe(target);
    });

    it('falls back to parent insertion when grandparent is not flex row', () => {
      const grandparent = document.createElement('div');
      grandparent.style.display = 'block';

      const parent = document.createElement('div');
      const target = document.createElement('span');
      target.textContent = 'target';

      grandparent.appendChild(parent);
      parent.appendChild(target);
      document.body.appendChild(grandparent);

      const badge = createBadge('user.bsky.social');
      injectBadge(badge, target);

      expect(parent.children[0]).toBe(badge);
      expect(parent.children[1]).toBe(target);
    });

    it('does nothing if target has no parent', () => {
      const target = document.createElement('span');
      const badge = createBadge('user.bsky.social');

      injectBadge(badge, target);

      expect(badge.parentElement).toBeNull();
    });
  });
});
