export function createMockArticle(textContent: string, images: string[] = []): HTMLElement {
  const article = document.createElement('article');
  const textDiv = document.createElement('div');
  textDiv.textContent = textContent;
  article.appendChild(textDiv);

  images.forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    Object.defineProperty(img, 'width', { value: 200, writable: true });
    Object.defineProperty(img, 'height', { value: 200, writable: true });
    article.appendChild(img);
  });

  return article;
}

export function createMockHandleLink(handle: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = `/${handle}`;
  link.textContent = `@${handle}`;
  return link;
}
