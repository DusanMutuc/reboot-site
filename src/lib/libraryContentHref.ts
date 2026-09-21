/** Keep content visible when a Legends member has saved the Legends-only Library view. */
export function withAllLibraryView(href: string): string {
  const match = href.match(/^(\/(?:library|legends-library)\/[^/?#][^?#]*)(\?[^#]*)?(#.*)?$/);
  if (!match) return href;

  const [, path, query = '', hash = ''] = match;
  const params = new URLSearchParams(query);
  params.set('libraryView', 'all');
  return `${path}?${params.toString()}${hash}`;
}
