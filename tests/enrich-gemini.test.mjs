import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createFallbackBrief, enrichNews, normalizeGeminiBrief } from '../src/enrich-gemini.mjs';

const items = [
  {
    title: 'OpenAI releases a model update',
    url: 'https://example.com/openai',
    summary: 'New model release for developers.',
    sourceName: 'OpenAI',
    category: 'AI',
    publishedAt: '2026-04-27T01:00:00.000Z'
  },
  {
    title: 'GitHub improves Actions automation',
    url: 'https://example.com/github',
    summary: 'Workflow automation release.',
    sourceName: 'GitHub',
    category: 'Developer',
    publishedAt: '2026-04-27T00:00:00.000Z'
  }
];

test('creates deterministic fallback briefing without Gemini credentials', () => {
  const brief = createFallbackBrief({
    items,
    generatedAt: '2026-04-27T02:00:00.000Z'
  });

  assert.equal(brief.generatedBy, 'local-fallback');
  assert.equal(brief.highlights.length, 2);
  assert.equal(brief.highlights[0].sourceUrl, 'https://example.com/openai');
  assert.ok(brief.topics.some((topic) => topic.name === 'AI'));
});

test('fallback narrative does not expose setup instructions to readers', () => {
  const brief = createFallbackBrief({
    items,
    generatedAt: '2026-04-27T02:00:00.000Z'
  });

  assert.doesNotMatch(brief.narrative, /GEMINI_API_KEY|configure/i);
  assert.match(brief.narrative, /source metadata/i);
});

test('fallback notes do not expose private configuration names', () => {
  const brief = createFallbackBrief({
    items,
    generatedAt: '2026-04-27T02:00:00.000Z'
  });

  assert.doesNotMatch(brief.notes.join(' '), /GEMINI_API_KEY/i);
});

test('normalizes Gemini JSON into the published brief schema', () => {
  const brief = normalizeGeminiBrief({
    narrative: 'A concise technology briefing.',
    highlights: [
      {
        title: 'Model update',
        whyItMatters: 'It changes builder workflows.',
        sourceUrl: 'https://example.com/openai'
      }
    ],
    topics: [{ name: 'AI', summary: 'Model releases', itemCount: 4 }]
  }, '2026-04-27T02:00:00.000Z');

  assert.equal(brief.generatedBy, 'gemini');
  assert.equal(brief.highlights[0].whyItMatters, 'It changes builder workflows.');
  assert.equal(brief.topics[0].itemCount, 4);
});

test('keeps a valid Gemini CLI generated brief instead of overwriting it', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'gemini-cli-brief-'));

  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(path.join(dataDir, 'news.json'), `${JSON.stringify({ items })}\n`);
    await writeFile(
      path.join(dataDir, 'status.json'),
      `${JSON.stringify({
        generatedAt: '2026-04-27T02:00:00.000Z',
        sourceCount: 2,
        itemCount: 2,
        errors: []
      })}\n`
    );
    await writeFile(
      path.join(dataDir, 'daily-brief.json'),
      `${JSON.stringify({
        generatedAt: '2026-04-27T02:00:00.000Z',
        generatedBy: 'gemini-cli',
        model: 'gemini-2.5-flash',
        narrative: 'CLI generated narrative.',
        highlights: [],
        topics: [{ name: 'AI', summary: 'CLI topic', itemCount: 1 }],
        notes: []
      })}\n`
    );

    const brief = await enrichNews({ dataDir, apiKey: '' });
    const written = JSON.parse(await readFile(path.join(dataDir, 'daily-brief.json'), 'utf8'));

    assert.equal(brief.generatedBy, 'gemini-cli');
    assert.equal(written.narrative, 'CLI generated narrative.');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('fallback brief can include xAI external signals', () => {
  const brief = createFallbackBrief({
    items,
    generatedAt: '2026-04-27T02:00:00.000Z',
    externalSignals: {
      signals: [
        {
          title: 'X discussion about infrastructure',
          summary: 'Operators are discussing an incident in real time.',
          sourceUrl: 'https://x.com/example/status/1',
          sourceName: 'X',
          category: 'Infrastructure',
          confidence: 'medium'
        }
      ]
    }
  });

  assert.equal(brief.highlights[0].title, 'X discussion about infrastructure');
  assert.equal(brief.highlights[0].sourceUrl, 'https://x.com/example/status/1');
});
