import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sources } from '../src/config.mjs';

test('source list covers a broad technology briefing surface', () => {
  assert.ok(sources.length >= 12);
  assert.ok(sources.some((source) => source.category === 'AI'));
  assert.ok(sources.some((source) => source.category === 'Infrastructure'));
  assert.ok(sources.some((source) => source.category === 'Developer'));
  assert.ok(sources.some((source) => source.category === 'Science'));
  assert.ok(sources.some((source) => source.category === 'Technology'));
});

test('source ids and urls are unique and valid', () => {
  const ids = new Set();
  const urls = new Set();

  for (const source of sources) {
    assert.match(source.id, /^[a-z0-9-]+$/);
    assert.doesNotThrow(() => new URL(source.url));
    assert.equal(ids.has(source.id), false, `duplicate source id: ${source.id}`);
    assert.equal(urls.has(source.url), false, `duplicate source url: ${source.url}`);
    ids.add(source.id);
    urls.add(source.url);
  }
});
