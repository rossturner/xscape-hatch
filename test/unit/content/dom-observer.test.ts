import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractHandlesFromArticle,
  extractImagesFromArticle,
  findHandleElements,
  getImageAuthor,
} from '../../../src/content/dom-observer';

describe('dom-observer helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('extractHandlesFromArticle', () => {
    it('extracts bluesky handle from text content', () => {
      const article = document.createElement('article');
      article.textContent = 'Follow me on user.bsky.social';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual(['user.bsky.social']);
    });

    it('extracts multiple handles', () => {
      const article = document.createElement('article');
      article.textContent = 'alice.bsky.social and bob.bsky.social are cool';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toContain('alice.bsky.social');
      expect(handles).toContain('bob.bsky.social');
    });

    it('deduplicates handles', () => {
      const article = document.createElement('article');
      article.textContent = 'user.bsky.social mentioned user.bsky.social twice';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual(['user.bsky.social']);
    });

    it('lowercases handles', () => {
      const article = document.createElement('article');
      article.textContent = 'USER.BSKY.SOCIAL';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual(['user.bsky.social']);
    });

    it('returns empty array when no handles', () => {
      const article = document.createElement('article');
      article.textContent = 'No bluesky handles here';

      const handles = extractHandlesFromArticle(article);

      expect(handles).toEqual([]);
    });
  });

  describe('extractImagesFromArticle', () => {
    it('extracts images larger than 100x100', () => {
      const article = document.createElement('article');
      const img = document.createElement('img');
      img.src = 'https://example.com/image.jpg';
      Object.defineProperty(img, 'width', { value: 200 });
      Object.defineProperty(img, 'height', { value: 200 });
      article.appendChild(img);

      const images = extractImagesFromArticle(article);

      expect(images).toHaveLength(1);
      expect(images[0].url).toBe('https://example.com/image.jpg');
      expect(images[0].element).toBeInstanceOf(HTMLImageElement);
    });

    it('filters out small images', () => {
      const article = document.createElement('article');
      const img = document.createElement('img');
      img.src = 'https://example.com/small.jpg';
      Object.defineProperty(img, 'width', { value: 50 });
      Object.defineProperty(img, 'height', { value: 50 });
      article.appendChild(img);

      const images = extractImagesFromArticle(article);

      expect(images).toEqual([]);
    });

    it('filters out avatar images by data-testid', () => {
      const article = document.createElement('article');
      const avatarContainer = document.createElement('div');
      avatarContainer.setAttribute('data-testid', 'Tweet-User-Avatar');
      const img = document.createElement('img');
      img.src = 'https://example.com/avatar.jpg';
      Object.defineProperty(img, 'width', { value: 200 });
      Object.defineProperty(img, 'height', { value: 200 });
      avatarContainer.appendChild(img);
      article.appendChild(avatarContainer);

      const images = extractImagesFromArticle(article);

      expect(images).toEqual([]);
    });

    it('filters out profile_images URLs', () => {
      const article = document.createElement('article');
      const img = document.createElement('img');
      img.src = 'https://pbs.twimg.com/profile_images/123/avatar.jpg';
      Object.defineProperty(img, 'width', { value: 200 });
      Object.defineProperty(img, 'height', { value: 200 });
      article.appendChild(img);

      const images = extractImagesFromArticle(article);

      expect(images).toEqual([]);
    });
  });

  describe('findHandleElements', () => {
    it('finds Twitter handle links', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/testuser';
      link.textContent = '@testuser';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements).toHaveLength(1);
      expect(elements[0].twitterHandle).toBe('testuser');
      expect(elements[0].inferredBluesky).toBe('testuser.bsky.social');
    });

    it('ignores links without @ prefix', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/testuser';
      link.textContent = 'testuser';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements).toHaveLength(0);
    });

    it('ignores handles longer than 15 characters', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/verylongusername123';
      link.textContent = '@verylongusername123';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements).toHaveLength(0);
    });

    it('lowercases inferred bluesky handle', () => {
      const article = document.createElement('article');
      const link = document.createElement('a');
      link.href = '/TestUser';
      link.textContent = '@TestUser';
      article.appendChild(link);

      const elements = findHandleElements(article);

      expect(elements[0].inferredBluesky).toBe('testuser.bsky.social');
    });
  });

  describe('getImageAuthor', () => {
    it('extracts author from image status URL', () => {
      document.body.innerHTML = `
        <article>
          <a href="/TestUser/status/123/photo/1">
            <img src="https://pbs.twimg.com/media/ABC.jpg" />
          </a>
        </article>
      `;
      const img = document.querySelector('img') as HTMLImageElement;
      expect(getImageAuthor(img)).toBe('TestUser');
    });

    it('returns null when no status URL found', () => {
      document.body.innerHTML = `
        <article>
          <img src="https://pbs.twimg.com/media/ABC.jpg" />
        </article>
      `;
      const img = document.querySelector('img') as HTMLImageElement;
      expect(getImageAuthor(img)).toBeNull();
    });

    it('extracts quoted author from quoted tweet image', () => {
      document.body.innerHTML = `
        <article>
          <a href="/QuotedUser/status/456/photo/1">
            <img src="https://pbs.twimg.com/media/DEF.jpg" />
          </a>
        </article>
      `;
      const img = document.querySelector('img') as HTMLImageElement;
      expect(getImageAuthor(img)).toBe('QuotedUser');
    });
  });
});
