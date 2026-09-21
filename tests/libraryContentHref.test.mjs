import assert from 'node:assert/strict';
import test from 'node:test';
import { withAllLibraryView } from '../src/lib/libraryContentHref.ts';

test('Library and Legends content links open the all-content view', () => {
  for (const path of ['/library/foundation-guide', '/legends-library/foundation-guide',
    '/library/123', '/library/node/123', '/legends-library/guide/']) {
    assert.equal(withAllLibraryView(path), `${path}?libraryView=all`);
  }
});

test('content links preserve other query values and block anchors', () => {
  const href = withAllLibraryView('/library/guide?resource=42&tag=a&tag=b&next=a%2Fb#block-42');
  const url = new URL(href, 'https://reboot.example');
  assert.equal(url.pathname, '/library/guide');
  assert.equal(url.searchParams.get('libraryView'), 'all');
  assert.equal(url.searchParams.get('resource'), '42');
  assert.deepEqual(url.searchParams.getAll('tag'), ['a', 'b']);
  assert.equal(url.searchParams.get('next'), 'a/b');
  assert.equal(url.hash, '#block-42');
  assert.equal(withAllLibraryView('/legends-library/guide#section'),
    '/legends-library/guide?libraryView=all#section');
});

test('an existing narrow view is replaced without duplicate view parameters', () => {
  const href = withAllLibraryView('/legends-library/guide?libraryView=legend&resource=7&libraryView=legend#block-7');
  const url = new URL(href, 'https://reboot.example');
  assert.deepEqual(url.searchParams.getAll('libraryView'), ['all']);
  assert.equal(url.searchParams.get('resource'), '7');
  assert.equal(url.hash, '#block-7');
  assert.equal(withAllLibraryView(href), href);
});

test('Library navigation and other destinations retain their exact URLs', () => {
  for (const href of ['', '/library', '/library/', '/library?libraryView=legend',
    '/legends-library', '/legends-library/', '/legends-library/?libraryView=legend#top',
    '/courses/foundation?lesson=3#video', '/r/42?download=1', '/library-other/guide',
    'https://example.com/library/guide?libraryView=legend#top',
    'http://example.com/legends-library/guide', '//example.com/library/guide',
    'library/guide', '#library']) {
    assert.equal(withAllLibraryView(href), href);
  }
});
