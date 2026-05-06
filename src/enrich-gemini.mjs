import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function enrichNews({
  dataDir = DEFAULT_DATA_DIR,
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
  fetcher = fetch
} = {}) {
  const news = JSON.parse(await readFile(path.join(dataDir, 'news.json'), 'utf8'));
  const status = JSON.parse(await readFile(path.join(dataDir, 'status.json'), 'utf8'));
  const externalSignals = await readOptionalJson(path.join(dataDir, 'external-signals.json'), {
    signals: []
  });
  const generatedAt = status.generatedAt ?? new Date().toISOString();
  const items = news.items ?? [];
  const existingBrief = await readExistingBrief(path.join(dataDir, 'daily-brief.json'));

  if (existingBrief && existingBrief.generatedBy === 'gemini-cli') {
    await writeJson(path.join(dataDir, 'topics.json'), {
      generatedAt: existingBrief.generatedAt,
      generatedBy: existingBrief.generatedBy,
      topics: existingBrief.topics
    });
    return existingBrief;
  }

  let brief;
  if (apiKey) {
    try {
      brief = await createGeminiBrief({ items, generatedAt, apiKey, model, fetcher });
    } catch (error) {
      brief = createFallbackBrief({ items, generatedAt, reason: error.message, externalSignals });
    }
  } else {
    brief = createFallbackBrief({ items, generatedAt, externalSignals });
  }

  await writeJson(path.join(dataDir, 'daily-brief.json'), brief);
  await writeJson(path.join(dataDir, 'topics.json'), {
    generatedAt,
    generatedBy: brief.generatedBy,
    topics: brief.topics
  });

  return brief;
}

export function createFallbackBrief({
  items,
  generatedAt,
  reason = 'Model-assisted synthesis unavailable',
  externalSignals = { signals: [] }
}) {
  const topics = createTopicSummaries(items);
  const signalHighlights = arrayOrEmpty(externalSignals.signals).slice(0, 2).map((signal) => ({
    title: signal.title,
    whyItMatters: signal.summary,
    sourceName: signal.sourceName,
    sourceUrl: signal.sourceUrl,
    category: signal.category,
    publishedAt: generatedAt
  }));
  const itemHighlights = items.slice(0, 6 - signalHighlights.length).map((item) => ({
    title: item.title,
    whyItMatters: item.summary || `A notable ${item.category || 'technology'} update from ${item.sourceName}.`,
    sourceName: item.sourceName,
    sourceUrl: item.url,
    category: item.category,
    publishedAt: item.publishedAt
  }));
  const highlights = [...signalHighlights, ...itemHighlights];

  return {
    generatedAt,
    generatedBy: 'local-fallback',
    model: null,
    narrative: buildFallbackNarrative(topics),
    highlights,
    topics,
    notes: [reason]
  };
}

export function normalizeGeminiBrief(value, generatedAt, model = DEFAULT_MODEL) {
  return {
    generatedAt,
    generatedBy: 'gemini',
    model,
    narrative: stringOrDefault(value.narrative, 'No narrative returned.'),
    highlights: arrayOrEmpty(value.highlights).slice(0, 8).map((item) => ({
      title: stringOrDefault(item.title, 'Untitled highlight'),
      whyItMatters: stringOrDefault(item.whyItMatters, ''),
      sourceName: stringOrDefault(item.sourceName, ''),
      sourceUrl: stringOrDefault(item.sourceUrl, ''),
      category: stringOrDefault(item.category, ''),
      publishedAt: stringOrDefault(item.publishedAt, '')
    })),
    topics: arrayOrEmpty(value.topics).slice(0, 8).map((topic) => ({
      name: stringOrDefault(topic.name, 'General'),
      summary: stringOrDefault(topic.summary, ''),
      itemCount: Number.isFinite(Number(topic.itemCount)) ? Number(topic.itemCount) : 0
    })),
    notes: arrayOrEmpty(value.notes).map((note) => String(note))
  };
}

async function createGeminiBrief({ items, generatedAt, apiKey, model, fetcher }) {
  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: buildPrompt(items) }]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}`);
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ?? '';
  return normalizeGeminiBrief(JSON.parse(text), generatedAt, model);
}

function buildPrompt(items) {
  const compactItems = items.slice(0, 80).map((item) => ({
    title: item.title,
    summary: item.summary,
    sourceName: item.sourceName,
    category: item.category,
    publishedAt: item.publishedAt,
    url: item.url
  }));

  return `Create a concise editorial technology briefing from these source-linked items.
Return only JSON with this schema:
{
  "narrative": "2-3 sentence synthesis",
  "highlights": [{"title": "...", "whyItMatters": "...", "sourceName": "...", "sourceUrl": "...", "category": "...", "publishedAt": "..."}],
  "topics": [{"name": "...", "summary": "...", "itemCount": 0}],
  "notes": ["optional caveats"]
}
Do not invent sources. Use only sourceUrl values from the input.
Items: ${JSON.stringify(compactItems)}`;
}

function createTopicSummaries(items) {
  const groups = new Map();

  for (const item of items) {
    const key = item.category || 'General';
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([name, group]) => ({
      name,
      summary: `${group.length} source-linked update${group.length === 1 ? '' : 's'}, led by ${group[0]?.sourceName || 'unknown source'}.`,
      itemCount: group.length
    }))
    .sort((a, b) => b.itemCount - a.itemCount || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function buildFallbackNarrative(topics) {
  if (topics.length === 0) {
    return 'No source-linked updates were available for this briefing cycle.';
  }

  const names = topics.slice(0, 3).map((topic) => topic.name).join(', ');
  return `This briefing cycle is led by ${names}. The summary is generated from source metadata and highlights the strongest signals available in this update.`;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function stringOrDefault(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function readExistingBrief(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8'));
    return isValidBrief(value) ? value : null;
  } catch {
    return null;
  }
}

async function readOptionalJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function isValidBrief(value) {
  return Boolean(
    value &&
      typeof value.generatedAt === 'string' &&
      typeof value.generatedBy === 'string' &&
      typeof value.narrative === 'string' &&
      Array.isArray(value.highlights) &&
      Array.isArray(value.topics) &&
      Array.isArray(value.notes)
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enrichNews().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
