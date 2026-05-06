import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { paginateItems, prepareStaticData } from '../src/prepare-data.mjs';

const items = Array.from({ length: 5 }, (_, index) => ({
  id: `item-${index + 1}`,
  title: `Item ${index + 1}`,
  url: `https://example.com/${index + 1}`,
  summary: 'Summary',
  publishedAt: `2026-04-2${index}T00:00:00.000Z`,
  sourceId: index % 2 === 0 ? 'openai' : 'github',
  sourceName: index % 2 === 0 ? 'OpenAI' : 'GitHub',
  category: index % 2 === 0 ? 'AI' : 'Developer'
}));

test('paginates items into numbered pages with metadata', () => {
  const pages = paginateItems(items, 2);

  assert.equal(pages.length, 3);
  assert.equal(pages[0].page, 1);
  assert.equal(pages[0].totalPages, 3);
  assert.deepEqual(
    pages.map((page) => page.items.length),
    [2, 2, 1]
  );
});

test('writes latest, pages, and manifest static data files', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'prepared-data-'));

  try {
    await prepareStaticData({
      outDir,
      items,
      status: {
        generatedAt: '2026-04-27T01:05:00.000Z',
        sourceCount: 2,
        itemCount: 5,
        errors: []
      },
      pageSize: 2,
      latestSize: 3
    });

    const latest = JSON.parse(await readFile(path.join(outDir, 'latest.json'), 'utf8'));
    const page2 = JSON.parse(await readFile(path.join(outDir, 'pages', '2.json'), 'utf8'));
    const manifest = JSON.parse(await readFile(path.join(outDir, 'manifest.json'), 'utf8'));

    assert.equal(latest.items.length, 3);
    assert.equal(page2.items[0].id, 'item-3');
    assert.equal(manifest.totalPages, 3);
    assert.deepEqual(manifest.categories, ['AI', 'Developer']);
    assert.equal(manifest.sources[0].count, 3);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
