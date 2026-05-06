import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { enrichExternalSignals, normalizeXaiSignals } from '../src/enrich-xai.mjs';

test('normalizes xAI signal JSON into a conservative schema', () => {
  const signals = normalizeXaiSignals(
    {
      signals: [
        {
          title: 'Model release discussed on X',
          summary: 'Developers are discussing a new model release.',
          sourceUrl: 'https://x.com/example/status/1',
          sourceName: 'X',
          category: 'AI',
          confidence: 'medium'
        },
        {
          title: '',
          summary: 'Missing title should be ignored.',
          sourceUrl: 'https://x.com/example/status/2'
        }
      ]
    },
    '2026-04-27T02:00:00.000Z',
    'grok-4.20'
  );

  assert.equal(signals.generatedBy, 'xai');
  assert.equal(signals.model, 'grok-4.20');
  assert.equal(signals.signals.length, 1);
  assert.equal(signals.signals[0].sourceUrl, 'https://x.com/example/status/1');
});

test('skips xAI enrichment without an API key and writes a valid empty file', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'xai-signals-'));

  try {
    const result = await enrichExternalSignals({
      dataDir,
      apiKey: '',
      generatedAt: '2026-04-27T02:00:00.000Z'
    });
    const written = JSON.parse(await readFile(path.join(dataDir, 'external-signals.json'), 'utf8'));

    assert.equal(result.generatedBy, 'skipped');
    assert.deepEqual(written.signals, []);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('writes xAI API response to external-signals.json', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'xai-signals-'));

  try {
    await enrichExternalSignals({
      dataDir,
      apiKey: 'test-key',
      generatedAt: '2026-04-27T02:00:00.000Z',
      fetcher: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  signals: [
                    {
                      title: 'Infrastructure incident',
                      summary: 'Operators are tracking a cloud incident.',
                      sourceUrl: 'https://example.com/incident',
                      sourceName: 'Example',
                      category: 'Infrastructure',
                      confidence: 'high'
                    }
                  ]
                })
              }
            }
          ]
        })
      })
    });

    const written = JSON.parse(await readFile(path.join(dataDir, 'external-signals.json'), 'utf8'));
    assert.equal(written.signals[0].title, 'Infrastructure incident');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
