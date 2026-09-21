import assert from 'node:assert/strict';
import test from 'node:test';
import { syncNativeResourceThumbnails } from '../src/lib/resourceThumbnailSync.ts';

function resource(id, overrides = {}) {
  return {
    id,
    title: `Resource ${id}`,
    type: 'image',
    url: `https://example.test/resources/${id}`,
    thumbnail: null,
    storage_bucket: 'resources',
    storage_path: `images/${id}.png`,
    state: 'published',
    is_discoverable: false,
    is_browsable: false,
    search_names: ['Admin alternate name'],
    ...overrides,
  };
}

// Implements only the fluent operations this job uses. All reads and writes
// stay in memory, and every provider request is supplied by the tests.
function database(initial, { cap = 1000, beforeWrite, failAfterId } = {}) {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  const reads = [];
  const writes = [];
  const client = {
    from(table) {
      assert.equal(table, 'resources');
      const filters = [];
      let afterId = null;
      let pageSize = Infinity;
      let patch;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push((row) => row[key] === value); return query; },
        is(key, value) { filters.push((row) => row[key] === value); return query; },
        gt(key, value) {
          assert.equal(key, 'id');
          afterId = value;
          filters.push((row) => row[key] > value);
          return query;
        },
        order(key, options) {
          assert.equal(key, 'id');
          assert.equal(options.ascending, true);
          return query;
        },
        limit(value) { pageSize = value; return query; },
        update(value) { patch = value; return query; },
        maybeSingle() { return Promise.resolve(execute(true)); },
        then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); },
      };
      function execute(single) {
        if (!patch) {
          reads.push(afterId);
          if (failAfterId !== undefined && afterId === failAfterId) {
            return { data: null, error: { message: 'Database page unavailable' } };
          }
          const data = [...rows.values()]
            .filter((row) => filters.every((matches) => matches(row)))
            .sort((left, right) => left.id - right.id)
            .slice(0, Math.min(cap, pageSize))
            .map((row) => structuredClone(row));
          return { data, error: null };
        }
        // First identify the requested row, then simulate a concurrent admin edit
        // before evaluating the conditional UPDATE filters.
        const candidate = [...rows.values()].find((row) => filters.every((matches) => matches(row)));
        if (candidate) beforeWrite?.(candidate);
        const matches = [...rows.values()].filter((row) => filters.every((match) => match(row)));
        const updated = matches.map((row) => {
          assert.deepEqual(Object.keys(patch), ['thumbnail'], 'never write curation or other resource fields');
          Object.assign(row, patch);
          writes.push({ id: row.id, patch: { ...patch } });
          return { id: row.id };
        });
        return { data: single ? updated[0] ?? null : updated, error: null };
      }
      return query;
    },
  };
  return { client, rows, reads, writes };
}

const noFetch = async () => { throw new Error('Unexpected provider request'); };
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('paginates past the database cap and 1000 resources without skipping later images', async () => {
  const initial = Array.from({ length: 1005 }, (_, index) => resource(index + 1));
  initial[0].thumbnail = 'https://example.test/admin-image.png';
  initial[1004].state = 'draft';
  const db = database(initial, { cap: 137 });

  const report = await syncNativeResourceThumbnails(db.client, { fetch: noFetch });

  assert.equal(report.examined, 1003);
  assert.equal(report.updated, 1003);
  assert.equal(report.unresolved, 0);
  assert.equal(report.byOrigin.stored_image, 1003);
  assert.equal(db.rows.get(1004).thumbnail, '/r/1004');
  assert.equal(db.rows.get(1005).thumbnail, null, 'draft resources stay untouched');
  assert.equal(db.rows.get(1).thumbnail, initial[0].thumbnail);
  assert.ok(db.reads.length > 8);
  assert.equal(db.reads.at(-1), 1004, 'continues until an empty page, not a short one');
});

test('fills NULL, empty and whitespace artwork while preserving curation and existing images', async () => {
  const initial = [
    resource(1),
    resource(2, { thumbnail: '' }),
    resource(3, { thumbnail: '   ' }),
    resource(4, { thumbnail: '\t' }),
    resource(5, { thumbnail: 'https://example.test/chosen.png' }),
    resource(6, { type: 'document', storage_bucket: null, storage_path: null }),
  ];
  const db = database(initial);

  const report = await syncNativeResourceThumbnails(db.client, { fetch: noFetch });

  assert.equal(report.updated, 4);
  assert.equal(report.unresolved, 1);
  for (const row of initial) {
    assert.deepEqual(db.rows.get(row.id), {
      ...row,
      thumbnail: row.id <= 4 ? `/r/${row.id}` : row.thumbnail,
    });
  }
});

test('concurrent admin artwork, publication or resource identity changes win over filling', async () => {
  const db = database([
    resource(1),
    resource(2, { thumbnail: '' }),
    resource(3, { thumbnail: ' ' }),
    resource(4),
    resource(5),
    resource(6),
    resource(7),
    resource(8),
  ], {
    beforeWrite(row) {
      if (row.id === 3) row.state = 'archived';
      else if (row.id === 4) row.url = 'https://example.test/replacement';
      else if (row.id === 5) row.type = 'document';
      else if (row.id === 6) row.storage_path = 'images/replacement.png';
      else if (row.id === 7) row.storage_bucket = 'replacement-bucket';
      else if (row.id === 8) row.title = 'A different episode';
      else row.thumbnail = `https://example.test/admin-${row.id}.png`;
    },
  });

  const report = await syncNativeResourceThumbnails(db.client, { fetch: noFetch });

  assert.equal(report.updated, 0);
  assert.equal(db.writes.length, 0);
  assert.equal(db.rows.get(1).thumbnail, 'https://example.test/admin-1.png');
  assert.equal(db.rows.get(2).thumbnail, 'https://example.test/admin-2.png');
  assert.equal(db.rows.get(3).thumbnail, ' ');
  for (const id of [4, 5, 6, 7, 8]) assert.equal(db.rows.get(id).thumbnail, null);
});

test('uses Vimeo oEmbed only for Vimeo videos and accepts HTTPS artwork', async () => {
  const db = database([
    resource(1, { type: 'video', url: 'https://player.vimeo.com/video/123', thumbnail: null }),
    resource(2, { type: 'video', url: 'https://vimeo.com/456', thumbnail: '' }),
    resource(3, { type: 'video', url: 'https://vimeo.com.attacker.test/789' }),
  ]);
  const calls = [];
  const report = await syncNativeResourceThumbnails(db.client, {
    async fetch(input) {
      const url = new URL(input);
      calls.push(url);
      assert.equal(url.origin + url.pathname, 'https://vimeo.com/api/oembed.json');
      assert.equal(url.searchParams.get('width'), '640');
      return json({
        thumbnail_url: url.searchParams.get('url').includes('123')
          ? 'https://i.vimeocdn.com/video/123.jpg'
          : 'http://example.test/insecure.jpg',
      });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(report.updated, 1);
  assert.equal(report.byOrigin.vimeo, 1);
  assert.equal(db.rows.get(1).thumbnail, 'https://i.vimeocdn.com/video/123.jpg');
  assert.equal(db.rows.get(2).thumbnail, '');
  assert.equal(db.rows.get(3).thumbnail, null);
});

test('paginates Transistor episodes and matches URL or title with show-art fallback', async () => {
  const db = database([
    resource(1, { type: 'podcast', url: 'https://share.transistor.fm/s/first?ref=website' }),
    resource(2, { type: 'podcast', title: ' Second   Episode ', url: 'https://example.test/old-link' }),
  ]);
  const pages = [];
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key',
    transistorShowId: 'test-show',
    async fetch(input, options) {
      const url = new URL(input);
      assert.equal(url.origin, 'https://api.transistor.fm');
      assert.equal(options.headers['x-api-key'], 'test-key');
      if (url.pathname === '/v1/shows/test-show') {
        return json({ data: { attributes: { image_url: 'https://example.test/show.jpg' } } });
      }
      assert.equal(url.pathname, '/v1/episodes');
      assert.equal(url.searchParams.get('status'), 'published');
      assert.equal(url.searchParams.get('show_id'), 'test-show');
      const page = Number(url.searchParams.get('pagination[page]'));
      pages.push(page);
      return json({
        data: [page === 1
          ? { id: 'first', attributes: { title: 'First Episode', share_url: 'https://share.transistor.fm/s/first' } }
          : { id: 'second', attributes: { title: 'Second Episode', image_url: 'https://example.test/second.jpg' } }],
        meta: { currentPage: page, totalPages: 2 },
      });
    },
  });

  assert.deepEqual(pages, [1, 2]);
  assert.equal(report.byOrigin.transistor, 2);
  assert.equal(db.rows.get(1).thumbnail, 'https://example.test/show.jpg');
  assert.equal(db.rows.get(2).thumbnail, 'https://example.test/second.jpg');
});

test('provider failures are reported while independently resolvable images are filled', async () => {
  const db = database([
    resource(1),
    resource(2, { type: 'video', url: 'https://vimeo.com/123' }),
    resource(3, { type: 'podcast' }),
  ]);
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key',
    transistorShowId: 'test-show',
    async fetch(input) {
      if (new URL(input).hostname === 'vimeo.com') return json({}, 429);
      return json({}, 503);
    },
  });

  assert.equal(report.updated, 1);
  assert.equal(report.unresolved, 2);
  assert.deepEqual(report.failures, [
    { resourceId: 2, message: 'Vimeo returned 429.' },
    { resourceId: null, message: 'Transistor show lookup returned 503.' },
  ]);
});

test('a later database page failure stops the job before any writes', async () => {
  const db = database([resource(1), resource(2), resource(3)], { cap: 2, failAfterId: 2 });

  await assert.rejects(
    syncNativeResourceThumbnails(db.client, { fetch: noFetch }),
    /Database page unavailable/,
  );
  assert.equal(db.writes.length, 0);
});

test('deadline keeps completed writes and the next run advances beyond slow Vimeo work', async (t) => {
  const db = database([
    resource(1),
    ...Array.from({ length: 8 }, (_, index) =>
      resource(index + 2, { type: 'video', url: `https://vimeo.com/${index + 2}` })),
  ]);
  let elapsed = 0;
  const timeouts = [];
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    timeouts.push(milliseconds);
    return new AbortController().signal;
  });
  const fetchProvider = async (input) => {
    assert.equal(db.rows.get(1).thumbnail, '/r/1', 'stored images finish before remote calls');
    const id = new URL(new URL(input).searchParams.get('url')).pathname.slice(1);
    elapsed += 4;
    return json({ thumbnail_url: `https://example.test/video-${id}.jpg` });
  };

  const first = await syncNativeResourceThumbnails(db.client, {
    fetch: fetchProvider, now: () => elapsed, maxDurationMs: 10,
  });

  assert.equal(first.budgetExhausted, true);
  assert.equal(first.updated, 4, 'one stored image plus three completed provider requests');
  assert.equal(first.unresolved, 5);
  assert.deepEqual(timeouts, [10, 6, 2], 'requests cannot outlive the remaining work budget');

  elapsed = 0;
  const second = await syncNativeResourceThumbnails(db.client, {
    fetch: fetchProvider, now: () => elapsed, maxDurationMs: 100,
  });
  assert.equal(second.updated, 5);
  assert.equal(second.unresolved, 0);
  assert.equal(second.budgetExhausted, false);
  assert.equal(db.writes.length, 9, 'completed resources are not overwritten on the next run');
});

test('Transistor saves each completed page and stops before another page after its deadline', async () => {
  const db = database([1, 2, 3].map((id) => resource(id, {
    type: 'podcast', title: `Episode ${id}`, url: `https://share.transistor.fm/s/${id}`,
  })));
  let elapsed = 0;
  const pages = [];

  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    now: () => elapsed, maxDurationMs: 10,
    async fetch(input) {
      const url = new URL(input);
      if (url.pathname.includes('/shows/')) {
        elapsed += 2;
        return json({ data: { attributes: { image_url: 'https://example.test/show.jpg' } } });
      }
      const page = Number(url.searchParams.get('pagination[page]'));
      if (page > 1) assert.equal(db.rows.get(page - 1).thumbnail, 'https://example.test/show.jpg');
      pages.push(page);
      elapsed += 4;
      return json({
        data: [{ id: String(page), attributes: { title: `Episode ${page}`, share_url: `https://share.transistor.fm/s/${page}` } }],
        meta: { currentPage: page, totalPages: 3 },
      });
    },
  });

  assert.deepEqual(pages, [1, 2]);
  assert.equal(report.updated, 2);
  assert.equal(report.unresolved, 1);
  assert.equal(report.budgetExhausted, true);
  assert.equal(db.rows.get(3).thumbnail, null);
});

test('a later Transistor page failure does not discard artwork from earlier pages', async () => {
  const db = database([resource(1, { type: 'podcast', title: 'First', url: 'https://share.transistor.fm/s/first' })]);
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    async fetch(input) {
      const url = new URL(input);
      if (url.pathname.includes('/shows/')) {
        return json({ data: { attributes: { image_url: 'https://example.test/show.jpg' } } });
      }
      if (url.searchParams.get('pagination[page]') === '2') {
        assert.equal(db.rows.get(1).thumbnail, 'https://example.test/show.jpg');
        return json({}, 503);
      }
      return json({
        data: [{ id: 'first', attributes: { title: 'First', share_url: 'https://share.transistor.fm/s/first' } }],
        meta: { currentPage: 1, totalPages: 2 },
      });
    },
  });

  assert.equal(report.updated, 1);
  assert.deepEqual(report.failures, [{ resourceId: null, message: 'Transistor returned 503.' }]);
});

test('Transistor retries a rate-limited request using Retry-After without losing the episode', async () => {
  const db = database([resource(1, { type: 'podcast', title: 'Episode' })]);
  let elapsed = 0;
  let attempts = 0;
  const waits = [];
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    now: () => elapsed, maxDurationMs: 5000,
    async sleep(milliseconds) { waits.push(milliseconds); elapsed += milliseconds; },
    async fetch(input) {
      if (new URL(input).pathname.includes('/shows/')) {
        return json({ data: { attributes: { image_url: 'https://example.test/show.jpg' } } });
      }
      attempts += 1;
      if (attempts === 1) {
        const response = json({}, 429);
        response.headers.set('retry-after', '1');
        return response;
      }
      return json({
        data: [{ id: 'episode', attributes: { title: 'Episode' } }],
        meta: { currentPage: 1, totalPages: 1 },
      });
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(waits, [1000]);
  assert.equal(report.updated, 1);
  assert.deepEqual(report.failures, []);
});

test('Transistor does not wait for a rate-limit reset beyond the remaining budget', async () => {
  const db = database([resource(1, { type: 'podcast' })]);
  let attempts = 0;
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    now: () => 0, maxDurationMs: 5000,
    async sleep() { assert.fail('ten-second fallback cannot fit in a five-second budget'); },
    async fetch(input) {
      if (new URL(input).pathname.includes('/shows/')) return json({ data: {} });
      attempts += 1;
      return json({}, 429);
    },
  });

  assert.equal(attempts, 1);
  assert.equal(report.updated, 0);
  assert.deepEqual(report.failures, [{ resourceId: null, message: 'Transistor returned 429.' }]);
});

test('persistent Transistor rate limits stop after two retries', async () => {
  const db = database([resource(1, { type: 'podcast' })]);
  let elapsed = 0;
  let attempts = 0;
  const waits = [];
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    now: () => elapsed, maxDurationMs: 90000,
    async sleep(milliseconds) { waits.push(milliseconds); elapsed += milliseconds; },
    async fetch(input) {
      if (new URL(input).pathname.includes('/shows/')) return json({ data: {} });
      attempts += 1;
      return json({}, 429);
    },
  });

  assert.equal(attempts, 3);
  assert.deepEqual(waits, [10000, 10000]);
  assert.equal(report.updated, 0);
  assert.deepEqual(report.failures, [{ resourceId: null, message: 'Transistor returned 429.' }]);
});

test('an exact URL on a later podcast page beats an earlier episode with the same title', async () => {
  const db = database([resource(1, {
    type: 'podcast', title: 'Repeated title', url: 'https://share.transistor.fm/s/right',
  })]);
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    async fetch(input) {
      const url = new URL(input);
      if (url.pathname.includes('/shows/')) return json({ data: {} });
      const page = Number(url.searchParams.get('pagination[page]'));
      if (page === 2) assert.equal(db.rows.get(1).thumbnail, null, 'title fallback must wait');
      const slug = page === 1 ? 'wrong' : 'right';
      return json({
        data: [{
          id: slug,
          attributes: {
            title: 'Repeated title',
            share_url: `https://share.transistor.fm/s/${slug}`,
            image_url: `https://example.test/${slug}.jpg`,
          },
        }],
        meta: { currentPage: page, totalPages: 2 },
      });
    },
  });

  assert.equal(report.updated, 1);
  assert.equal(db.rows.get(1).thumbnail, 'https://example.test/right.jpg');
  assert.equal(db.writes.length, 1);
});

test('a podcast title fallback is not saved if later pagination fails', async () => {
  const db = database([resource(1, { type: 'podcast', title: 'Repeated title' })]);
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    async fetch(input) {
      const url = new URL(input);
      if (url.pathname.includes('/shows/')) return json({ data: {} });
      const page = Number(url.searchParams.get('pagination[page]'));
      if (page === 2) return json({}, 503);
      return json({
        data: [{
          id: 'first',
          attributes: { title: 'Repeated title', image_url: 'https://example.test/possibly-wrong.jpg' },
        }],
        meta: { currentPage: 1, totalPages: 2 },
      });
    },
  });

  assert.equal(report.updated, 0);
  assert.equal(report.unresolved, 1);
  assert.equal(db.rows.get(1).thumbnail, null);
  assert.equal(report.failures.length, 1);
});

test('a podcast title fallback is not saved if the deadline truncates pagination', async () => {
  const db = database([resource(1, { type: 'podcast', title: 'Repeated title' })]);
  let elapsed = 0;
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    now: () => elapsed, maxDurationMs: 10,
    async fetch(input) {
      const url = new URL(input);
      if (url.pathname.includes('/shows/')) return json({ data: {} });
      elapsed = 10;
      return json({
        data: [{
          id: 'first',
          attributes: { title: 'Repeated title', image_url: 'https://example.test/possibly-wrong.jpg' },
        }],
        meta: { currentPage: 1, totalPages: 2 },
      });
    },
  });

  assert.equal(report.updated, 0);
  assert.equal(report.unresolved, 1);
  assert.equal(report.budgetExhausted, true);
  assert.equal(db.rows.get(1).thumbnail, null);
});

test('an exact episode without artwork still prevents another same-title episode fallback', async () => {
  const db = database([resource(1, {
    type: 'podcast', title: 'Repeated title', url: 'https://share.transistor.fm/s/right',
  })]);
  const report = await syncNativeResourceThumbnails(db.client, {
    transistorApiKey: 'test-key', transistorShowId: 'test-show',
    async fetch(input) {
      const url = new URL(input);
      if (url.pathname.includes('/shows/')) return json({ data: {} });
      const page = Number(url.searchParams.get('pagination[page]'));
      const slug = page === 1 ? 'wrong' : 'right';
      return json({
        data: [{
          id: slug,
          attributes: {
            title: 'Repeated title',
            share_url: `https://share.transistor.fm/s/${slug}`,
            image_url: page === 1 ? 'https://example.test/wrong.jpg' : null,
          },
        }],
        meta: { currentPage: page, totalPages: 2 },
      });
    },
  });

  assert.equal(report.updated, 0);
  assert.equal(report.unresolved, 1);
  assert.equal(db.rows.get(1).thumbnail, null);
});
