import assert from 'node:assert/strict';
import { test } from 'node:test';

import { site } from '../src/config.mjs';

test('site config carries the Musk Palimpsest brand safely', () => {
  assert.equal(site.title, "Musk's Palimpsest");
  assert.equal(site.tagline, 'Traces of technology, power, and tomorrow.');
  assert.match(site.description, /technology, power, and tomorrow/);
  assert.equal(
    site.disclaimer,
    'Independent publication. No affiliation, endorsement, sponsorship, or authorization is implied.'
  );
});
