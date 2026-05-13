import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('update workflow commits root and nested public data JSON files', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/update-news.yml', import.meta.url),
    'utf8'
  );

  assert.match(workflow, /file_pattern:\s*\|\s*\r?\n\s+public\/data\/\*\.json\r?\n\s+public\/data\/\*\*\/\*\.json/);
});
