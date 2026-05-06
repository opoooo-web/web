import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('vellum orbit logo asset is an accessible SVG', async () => {
  const svg = await readFile(new URL('../public/logo.svg', import.meta.url), 'utf8');

  assert.match(svg, /<svg[^>]+viewBox="0 0 190 190"/);
  assert.match(svg, /<title[^>]*>Musk's Palimpsest Vellum Orbit logo<\/title>/);
  assert.match(svg, /#1F5F74/);
  assert.match(svg, /#D4A437/);
});
