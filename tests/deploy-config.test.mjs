import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('deploy script targets Cloudflare Pages static output', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );

  assert.equal(
    packageJson.scripts.deploy,
    'npx wrangler pages deploy dist --project-name automated-news-site'
  );
  assert.doesNotMatch(packageJson.scripts.deploy, /\bwrangler deploy\b/);
});
