import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { site, sources } from './config.mjs';

const UTM_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid'
]);

export function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (UTM_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
}

export function parseFeed(xml, source) {
  const itemBlocks = matchBlocks(xml, 'item');
  const entryBlocks = matchBlocks(xml, 'entry');
  const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;

  return blocks
    .map((block) => normalizeFeedItem(block, source))
    .filter(Boolean);
}

export function dedupeItems(items) {
  const byUrl = new Map();

  for (const item of items) {
    const key = normalizeUrl(item.url);
    const existing = byUrl.get(key);
    if (!existing || toTime(item.publishedAt) > toTime(existing.publishedAt)) {
      byUrl.set(key, { ...item, url: key });
    }
  }

  return [...byUrl.values()];
}

export function sortItems(items) {
  return [...items].sort((a, b) => toTime(b.publishedAt) - toTime(a.publishedAt));
}

export async function collectNews({
  feedSources = sources,
  outputDir = path.join(process.cwd(), 'public', 'data'),
  fetcher = fetch,
  maxItems = site.maxItems
} = {}) {
  const collected = [];
  const errors = [];

  for (const source of feedSources) {
    try {
      const response = await fetcher(source.url, {
        headers: { 'user-agent': 'automated-news-site/0.1' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const xml = await response.text();
      collected.push(...parseFeed(xml, source));
    } catch (error) {
      errors.push({
        sourceId: source.id,
        sourceName: source.name,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const items = sortItems(dedupeItems(collected)).slice(0, maxItems);
  const status = {
    generatedAt: new Date().toISOString(),
    sourceCount: feedSources.length,
    itemCount: items.length,
    errors
  };

  await mkdir(outputDir, { recursive: true });
  const changed = await writeJsonIfChanged(path.join(outputDir, 'news.json'), { items });
  await writeJsonIfChanged(path.join(outputDir, 'status.json'), status);

  if (changed) {
    const [dateStr, timePart] = status.generatedAt.split('T');
    const timeStr = timePart.replace(/:/g, '-').split('.')[0];
    const archiveDir = path.join(outputDir, 'archive', dateStr);

    await mkdir(archiveDir, { recursive: true });
    await writeFile(
      path.join(archiveDir, `${timeStr}.json`),
      `${JSON.stringify({ items }, null, 2)}\n`
    );
  }

  return { items, status };
}

function normalizeFeedItem(block, source) {
  const title = cleanText(getTag(block, 'title'));
  const rawUrl = getItemUrl(block);

  if (!title || !rawUrl) {
    return null;
  }

  const url = normalizeUrl(rawUrl);
  const summary = cleanText(
    getTag(block, 'description') ||
      getTag(block, 'summary') ||
      getTag(block, 'content') ||
      getTag(block, 'content:encoded')
  );
  const publishedAt = normalizeDate(
    getTag(block, 'pubDate') ||
      getTag(block, 'published') ||
      getTag(block, 'updated') ||
      new Date().toISOString()
  );

  return {
    id: `${source.id}:${url}`,
    title,
    url,
    summary,
    publishedAt,
    sourceId: source.id,
    sourceName: source.name,
    category: source.category
  };
}

function getItemUrl(block) {
  const link = getTag(block, 'link');
  if (link && !link.includes('<')) {
    return cleanText(link);
  }

  const hrefMatch = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return hrefMatch ? decodeEntities(hrefMatch[1]) : '';
}

function matchBlocks(xml, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...xml.matchAll(regex)].map((match) => match[1]);
}

function getTag(block, tag) {
  const regex = new RegExp(`<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i');
  const match = block.match(regex);
  return match ? match[1] : '';
}

function cleanText(value) {
  return decodeEntities(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeDate(value) {
  const time = Date.parse(cleanText(value));
  return Number.isNaN(time) ? new Date().toISOString() : new Date(time).toISOString();
}

function toTime(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function writeJsonIfChanged(filePath, data) {
  const next = `${JSON.stringify(data, null, 2)}\n`;

  try {
    const current = await readFile(filePath, 'utf8');
    if (current === next) {
      return false;
    }
  } catch {
    // File does not exist yet.
  }

  await writeFile(filePath, next);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  collectNews().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
