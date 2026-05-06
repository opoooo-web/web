import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dedupeItems,
  normalizeUrl,
  parseFeed,
  sortItems
} from '../src/collector.mjs';

const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <item>
      <title>First item</title>
      <link>https://example.com/news?a=1&amp;utm_source=x#section</link>
      <description>A short summary.</description>
      <pubDate>Mon, 27 Apr 2026 01:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

test('normalizes URLs for stable deduplication', () => {
  assert.equal(
    normalizeUrl('https://example.com/post?utm_source=x&id=10#comments'),
    'https://example.com/post?id=10'
  );
});

test('parses RSS feed items into normalized news records', () => {
  const [item] = parseFeed(rss, {
    id: 'example',
    name: 'Example',
    category: 'Tech',
    url: 'https://example.com/rss.xml'
  });

  assert.deepEqual(item, {
    id: 'example:https://example.com/news?a=1',
    title: 'First item',
    url: 'https://example.com/news?a=1',
    summary: 'A short summary.',
    publishedAt: '2026-04-27T01:00:00.000Z',
    sourceId: 'example',
    sourceName: 'Example',
    category: 'Tech'
  });
});

test('deduplicates by normalized URL and keeps the newest item', () => {
  const items = [
    {
      id: 'a',
      title: 'Old',
      url: 'https://example.com/a',
      publishedAt: '2026-04-26T00:00:00.000Z'
    },
    {
      id: 'b',
      title: 'New',
      url: 'https://example.com/a?utm_campaign=test',
      publishedAt: '2026-04-27T00:00:00.000Z'
    }
  ];

  assert.equal(dedupeItems(items)[0].title, 'New');
});

test('sorts newest items first', () => {
  const sorted = sortItems([
    { title: 'Older', publishedAt: '2026-04-25T00:00:00.000Z' },
    { title: 'Newer', publishedAt: '2026-04-27T00:00:00.000Z' }
  ]);

  assert.deepEqual(
    sorted.map((item) => item.title),
    ['Newer', 'Older']
  );
});
