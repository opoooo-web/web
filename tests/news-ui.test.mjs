import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  canLoadNextPage,
  filterItems,
  getCategories,
  getLeadItem,
  shouldEnableCursorEffects,
  summarizeStatus
} from '../src/news-ui.mjs';

const items = [
  {
    title: 'OpenAI releases model update',
    summary: 'A product announcement for builders.',
    sourceName: 'OpenAI',
    category: 'AI',
    publishedAt: '2026-04-27T01:00:00.000Z'
  },
  {
    title: 'GitHub improves Actions',
    summary: 'Developer automation release.',
    sourceName: 'GitHub',
    category: 'Developer',
    publishedAt: '2026-04-26T01:00:00.000Z'
  }
];

test('filters items by query and category', () => {
  assert.deepEqual(filterItems(items, { query: 'builders', category: 'AI' }), [items[0]]);
  assert.deepEqual(filterItems(items, { query: 'builders', category: 'Developer' }), []);
});

test('returns sorted unique categories', () => {
  assert.deepEqual(getCategories(items), ['AI', 'Developer']);
});

test('uses the newest item as the editorial lead', () => {
  assert.equal(getLeadItem(items), items[0]);
});

test('summarizes generation status for the interface', () => {
  assert.equal(
    summarizeStatus({
      generatedAt: '2026-04-27T01:05:00.000Z',
      sourceCount: 3,
      itemCount: 120,
      errors: [{ sourceId: 'x' }]
    }),
    '120 items from 3 sources · 1 source needs attention'
  );
});

test('detects when paginated feed can load another page', () => {
  assert.equal(canLoadNextPage({ currentPage: 1, totalPages: 3, isLoading: false }), true);
  assert.equal(canLoadNextPage({ currentPage: 3, totalPages: 3, isLoading: false }), false);
  assert.equal(canLoadNextPage({ currentPage: 1, totalPages: 3, isLoading: true }), false);
});

test('enables cursor effects only for precise non-reduced-motion pointers', () => {
  assert.equal(shouldEnableCursorEffects({ hover: true, finePointer: true, reducedMotion: false }), true);
  assert.equal(shouldEnableCursorEffects({ hover: false, finePointer: true, reducedMotion: false }), false);
  assert.equal(shouldEnableCursorEffects({ hover: true, finePointer: false, reducedMotion: false }), false);
  assert.equal(shouldEnableCursorEffects({ hover: true, finePointer: true, reducedMotion: true }), false);
});
