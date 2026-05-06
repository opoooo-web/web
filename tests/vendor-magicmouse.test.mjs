import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('MagicMouse vendor asset is present with license', async () => {
  const source = await readFile(new URL('../public/vendor/magicmouse/magicmouse.cdn.min.js', import.meta.url), 'utf8');
  const license = await readFile(new URL('../public/vendor/magicmouse/LICENSE', import.meta.url), 'utf8');

  assert.match(source, /magicMouse/);
  assert.match(license, /MIT License/);
});
