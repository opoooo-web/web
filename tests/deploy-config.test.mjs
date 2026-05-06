import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('deploy script does not call Wrangler inside Cloudflare Pages git builds', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );

  assert.equal(
    packageJson.scripts.deploy,
    'node scripts/cloudflare-pages-deploy.mjs'
  );
  assert.doesNotMatch(packageJson.scripts.deploy, /\bwrangler\b/);
});
