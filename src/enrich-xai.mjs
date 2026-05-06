import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'public', 'data');
const DEFAULT_MODEL = 'grok-4.20';
const DEFAULT_ENDPOINT = 'https://api.x.ai/v1/chat/completions';

export async function enrichExternalSignals({
  dataDir = DEFAULT_DATA_DIR,
  apiKey = process.env.XAI_API_KEY,
  model = process.env.XAI_MODEL || DEFAULT_MODEL,
  generatedAt,
  fetcher = fetch
} = {}) {
  await mkdir(dataDir, { recursive: true });
  const resolvedGeneratedAt = generatedAt ?? (await readGeneratedAt(dataDir));

  if (!apiKey) {
    const skipped = {
      generatedAt: resolvedGeneratedAt,
      generatedBy: 'skipped',
      model: null,
      signals: [],
      notes: ['XAI_API_KEY not configured']
    };
    await writeJson(path.join(dataDir, 'external-signals.json'), skipped);
    return skipped;
  }

  try {
    const payload = await requestXaiSignals({ dataDir, apiKey, model, fetcher });
    const signals = normalizeXaiSignals(payload, resolvedGeneratedAt, model);
    await writeJson(path.join(dataDir, 'external-signals.json'), signals);
    return signals;
  } catch (error) {
    const fallback = {
      generatedAt: resolvedGeneratedAt,
      generatedBy: 'xai-error',
      model,
      signals: [],
      notes: [error instanceof Error ? error.message : String(error)]
    };
    await writeJson(path.join(dataDir, 'external-signals.json'), fallback);
    return fallback;
  }
}

export function normalizeXaiSignals(value, generatedAt, model) {
  return {
    generatedAt,
    generatedBy: 'xai',
    model,
    signals: arrayOrEmpty(value.signals)
      .map((signal) => normalizeSignal(signal))
      .filter(Boolean)
      .slice(0, 20),
    notes: arrayOrEmpty(value.notes).map((note) => String(note))
  };
}

async function requestXaiSignals({ dataDir, apiKey, model, fetcher }) {
  const latest = await readJson(path.join(dataDir, 'latest.json'), { items: [] });
  const status = await readJson(path.join(dataDir, 'status.json'), {});
  const response = await fetcher(DEFAULT_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You generate conservative source-linked technology signals. Return JSON only. Do not invent URLs.'
        },
        {
          role: 'user',
          content: buildPrompt(latest.items ?? [], status)
        }
      ],
      response_format: { type: 'json_object' },
      search_parameters: {
        mode: 'auto'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`xAI HTTP ${response.status}`);
  }

  const body = await response.json();
  const content = body.choices?.[0]?.message?.content ?? '';
  return JSON.parse(content);
}

function buildPrompt(items, status) {
  const compactItems = items.slice(0, 30).map((item) => ({
    title: item.title,
    sourceName: item.sourceName,
    category: item.category,
    url: item.url
  }));

  return `Find current external signals from web/X search that complement this briefing.
Return JSON:
{
  "signals": [
    {
      "title": "short title",
      "summary": "one sentence",
      "sourceUrl": "source URL",
      "sourceName": "source or account",
      "category": "AI | Infrastructure | Developer | Science | Technology",
      "confidence": "high | medium | low"
    }
  ],
  "notes": []
}
Constraints:
- Prefer public source URLs that can be opened without login.
- Include X URLs only when they add unique real-time value.
- Do not duplicate these existing items: ${JSON.stringify(compactItems)}
- Current feed status: ${JSON.stringify(status)}`;
}

function normalizeSignal(signal) {
  const title = stringOrEmpty(signal.title);
  const sourceUrl = stringOrEmpty(signal.sourceUrl);
  const summary = stringOrEmpty(signal.summary);

  if (!title || !sourceUrl || !isValidUrl(sourceUrl)) {
    return null;
  }

  return {
    title,
    summary,
    sourceUrl,
    sourceName: stringOrEmpty(signal.sourceName) || new URL(sourceUrl).hostname,
    category: normalizeCategory(signal.category),
    confidence: normalizeConfidence(signal.confidence)
  };
}

function normalizeCategory(value) {
  const category = stringOrEmpty(value);
  return ['AI', 'Infrastructure', 'Developer', 'Science', 'Technology'].includes(category)
    ? category
    : 'Technology';
}

function normalizeConfidence(value) {
  const confidence = stringOrEmpty(value).toLowerCase();
  return ['high', 'medium', 'low'].includes(confidence) ? confidence : 'medium';
}

async function readGeneratedAt(dataDir) {
  const status = await readJson(path.join(dataDir, 'status.json'), {});
  return status.generatedAt ?? new Date().toISOString();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  enrichExternalSignals().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
